import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { addHours } from '@/lib/utils';
import { notifyAdminNewBooking } from '@/lib/notify';
import { z } from 'zod';
import { encryptPhone } from '@/lib/crypto';
import { isPassDateEligible, PASS_WEEKDAY_ONLY_ERROR } from '@/lib/pass-rules';
import {
  isGuildMembershipType,
  validateGuildBenefitApplication,
} from '@/lib/guild-membership';
import { findActiveGuildMembership } from '@/lib/guild-membership-server';
import { validateAdminWalkinTime } from '@/lib/admin-walkin-time';
import { adminGameRequestSchema } from '@/lib/game-request';
import {
  hasBookingConflict,
  isVenueAtCapacityDuring,
  meetsStationMinimumDuration,
} from '@/lib/booking-availability';
import { runSerializableTransaction } from '@/lib/prisma-transaction';

const CONTROLLER_PASS_TYPES = new Set(['BRONZE', 'SILVER', 'GOLD']);
const SIMULATOR_PASS_TYPES = new Set(['BLACK', 'APEX']);

function isPassTypeAllowedForStation(passType: string, hasControllers: boolean) {
  return hasControllers
    ? CONTROLLER_PASS_TYPES.has(passType)
    : SIMULATOR_PASS_TYPES.has(passType);
}

class WalkinCreationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const walkinSchema = z.object({
  customerName:     z.string().min(1, 'Customer name is required'),
  customerPhone:    z.string().optional(),
  stationId:        z.string().min(1),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime:        z.string().regex(/^\d{2}:\d{2}$/),
  duration:         z.number().min(0.5).max(12).refine((v) => v % 0.5 === 0, 'Duration must be in 30-min increments'),
  extraControllers: z.number().int().min(0).max(3).optional(),
  notes:            adminGameRequestSchema,
  status:           z.enum(['PENDING', 'CONFIRMED']).optional(),
  usePass:          z.boolean().optional(),
  linkedUserId:     z.string().nullable().optional(), // registered user linked to this walk-in
});

// GET — list all offline (walk-in) bookings
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date      = searchParams.get('date');
  const stationId = searchParams.get('stationId');
  const page      = parseInt(searchParams.get('page') ?? '1');
  const limit     = parseInt(searchParams.get('limit') ?? '50');

  const where: Record<string, unknown> = { bookingType: 'OFFLINE' };
  if (date)      where.date      = date;
  if (stationId) where.stationId = stationId;

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: { station: { select: { id: true, name: true } } },
      orderBy: [{ date: 'desc' }, { startTime: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  const encryptedBookings = bookings.map((booking) => ({
    ...booking,
    customerPhone: encryptPhone(booking.customerPhone),
  }));

  return NextResponse.json({ bookings: encryptedBookings, total });
}

// POST — create a walk-in booking (admin only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const result = walkinSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', issues: result.error.issues }, { status: 400 });
    }

    const { customerName, customerPhone, stationId, date, startTime, duration, notes, status, extraControllers: rawExtra } = result.data;
    const timeValidation = validateAdminWalkinTime(startTime, duration);
    if (!timeValidation.valid) {
      return NextResponse.json(
        { error: timeValidation.reason, code: timeValidation.code },
        { status: 400 },
      );
    }
    const endTime = addHours(startTime, duration);
    const extraControllers = Math.min(3, Math.max(0, rawExtra ?? 0));
    const passId: string | null = typeof body.passId === 'string' ? body.passId : null;

    // Check station exists and is active
    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station || !station.isActive) {
      return NextResponse.json({ error: 'Station not found or inactive' }, { status: 404 });
    }
    if (!meetsStationMinimumDuration(duration, station.minDuration)) {
      return NextResponse.json(
        {
          error: `This station requires a minimum ${station.minDuration}-hour session.`,
          code: 'MINIMUM_DURATION',
        },
        { status: 400 },
      );
    }

    // Server-side guard: ignore controllers for stations that don't support them
    const safeExtraControllers = station.hasControllers ? extraControllers : 0;

    const requestedInterval = { startTime, endTime };

    const { usePass, linkedUserId } = result.data;
    const discount: number = Math.min(100, Math.max(0, parseInt(String(body.discount ?? 0)) || 0));
    const requestedBenefit = body.appliedBenefitType;

    if (usePass && discount > 0) {
      return NextResponse.json(
        { error: 'A pass cannot be combined with another discount.', code: 'BENEFIT_STACKING' },
        { status: 400 }
      );
    }
    if (usePass && !linkedUserId) {
      return NextResponse.json(
        { error: 'A registered user must be linked to use a pass.' },
        { status: 400 }
      );
    }

    const activeMembership = linkedUserId
      ? await findActiveGuildMembership(linkedUserId)
      : null;
    let appliedBenefitType: string | null = null;

    if (requestedBenefit != null) {
      const requestedMembership = linkedUserId && isGuildMembershipType(requestedBenefit)
        ? await findActiveGuildMembership(linkedUserId, requestedBenefit)
        : null;
      const validation = validateGuildBenefitApplication({
        requestedBenefit,
        membership: requestedMembership,
        bookingDate: date,
        hasControllers: station.hasControllers,
        extraControllers: safeExtraControllers,
        discount,
        hasLinkedUser: Boolean(linkedUserId),
        hasHourPass: Boolean(usePass),
      });
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.reason, code: validation.code },
          { status: 400 }
        );
      }
      appliedBenefitType = validation.benefitType;
    }

    // Fetch controller price from settings
    let controllerUnitPrice = 0;
    if (safeExtraControllers > 0) {
      const setting = await prisma.setting.findUnique({ where: { key: 'controller_price' } });
      controllerUnitPrice = parseFloat(setting?.value ?? '0');
    }
    const controllerCharge = safeExtraControllers * controllerUnitPrice * duration;

    if (usePass && !isPassDateEligible(date)) {
      return NextResponse.json(
        { error: PASS_WEEKDAY_ONLY_ERROR, code: 'PASS_WEEKDAY_ONLY' },
        { status: 400 }
      );
    }

    const booking = await runSerializableTransaction(async (tx) => {
      const [capacitySetting, allBookingsToday] = await Promise.all([
        tx.setting.findUnique({ where: { key: 'venue_capacity' } }),
        tx.booking.findMany({
          where: { date, status: { not: 'CANCELLED' } },
          select: {
            stationId: true,
            startTime: true,
            endTime: true,
            bookingType: true,
          },
        }),
      ]);
      const stationConflict = allBookingsToday.find((existing) => (
        existing.stationId === stationId
        && hasBookingConflict(requestedInterval, [existing])
      ));
      if (stationConflict) {
        const who = stationConflict.bookingType === 'OFFLINE'
          ? 'another walk-in customer'
          : 'an online customer';
        throw new WalkinCreationError(
          `This slot is already booked by ${who}. Please choose a different time.`,
          409,
          'STATION_CONFLICT',
        );
      }
      if (isVenueAtCapacityDuring(
        requestedInterval,
        allBookingsToday,
        capacitySetting?.value,
      )) {
        throw new WalkinCreationError(
          'The venue is fully booked at this time. Please choose a different slot.',
          409,
          'VENUE_FULL',
        );
      }

      let userPassId: string | null = null;
      let passHoursDeducted = 0;
      let sessionPrice = station.hourlyRate * duration;

      if (usePass && linkedUserId) {
        const now = new Date();
        const pass = passId
          ? await tx.userPass.findFirst({
              where: {
                id: passId,
                userId: linkedUserId,
                status: 'ACTIVE',
                expiresAt: { gte: now },
              },
            })
          : (await tx.userPass.findMany({
              where: {
                userId: linkedUserId,
                status: 'ACTIVE',
                expiresAt: { gte: now },
              },
              orderBy: { purchasedAt: 'desc' },
            })).find((candidate) => (
              isPassTypeAllowedForStation(candidate.passType, station.hasControllers)
            )) ?? null;

        if (!pass) {
          throw new WalkinCreationError(
            'No active pass found for this user.',
            400,
            'PASS_NOT_FOUND',
          );
        }
        if (!isPassTypeAllowedForStation(pass.passType, station.hasControllers)) {
          throw new WalkinCreationError(
            'This pass cannot be used on the selected station.',
            400,
            'PASS_STATION_MISMATCH',
          );
        }
        const remaining = pass.totalHours - pass.usedHours;
        if (remaining + Number.EPSILON < duration) {
          throw new WalkinCreationError(
            `Not enough pass hours. ${remaining} hr(s) remaining, need ${duration}.`,
            400,
            'PASS_HOURS_INSUFFICIENT',
          );
        }

        const newUsed = pass.usedHours + duration;
        await tx.userPass.update({
          where: { id: pass.id },
          data: {
            usedHours: newUsed,
            status: newUsed >= pass.totalHours ? 'EXHAUSTED' : 'ACTIVE',
          },
        });
        userPassId = pass.id;
        passHoursDeducted = duration;
        sessionPrice = 0;
      }

      const totalPrice = Math.round(
        (sessionPrice + controllerCharge) * (1 - discount / 100),
      );
      return tx.booking.create({
        data: {
          userId: linkedUserId ?? null,
          stationId,
          date,
          startTime,
          endTime,
          duration,
          totalPrice,
          status: status ?? 'CONFIRMED',
          bookingType: 'OFFLINE',
          customerName,
          customerPhone: customerPhone ?? null,
          paymentStatus: usePass ? 'PAID' : 'UNPAID',
          extraControllers: safeExtraControllers,
          controllerCharge,
          discount,
          notes: notes || null,
          userPassId,
          passHoursDeducted,
          appliedBenefitType,
        },
        include: {
          station: { select: { id: true, name: true } },
        },
      });
    });

    // Fire-and-forget admin notification
    notifyAdminNewBooking({
      bookingId:        booking.id,
      customerName:     booking.customerName ?? 'Walk-in',
      customerEmail:    null,
      customerPhone:    booking.customerPhone ?? null,
      stationName:      booking.station.name,
      date:             booking.date,
      startTime:        booking.startTime,
      endTime:          booking.endTime,
      duration:         booking.duration,
      totalPrice:       booking.totalPrice,
      discount,
      bookingType:      'OFFLINE',
      extraControllers: booking.extraControllers,
      membershipType: activeMembership?.passType ?? null,
      membershipExpiresAt: activeMembership?.expiresAt ?? null,
      appliedBenefitType,
      normalPrice: station.hourlyRate * duration + controllerCharge,
      notes:            booking.notes,
    });

    return NextResponse.json({
      booking: { ...booking, customerPhone: encryptPhone(booking.customerPhone) },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof WalkinCreationError) {
      return NextResponse.json(
        { error: error.message, ...(error.code ? { code: error.code } : {}) },
        { status: error.status },
      );
    }
    console.error('Walk-in booking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
