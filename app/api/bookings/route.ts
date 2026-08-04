import { after, NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { bookingSchema } from '@/lib/validations';
import { addHours } from '@/lib/utils';
import { notifyAdminNewBooking, notifyUserNewBooking } from '@/lib/notify';
import { encryptPhone } from '@/lib/crypto';
import { isPassDateEligible, PASS_WEEKDAY_ONLY_ERROR } from '@/lib/pass-rules';
import {
  GUILD_MEMBERSHIP_TYPES,
  selectPreferredGuildMembership,
} from '@/lib/guild-membership';
import {
  isBookingStartPastInIndia,
  validatePublicBookingTime,
} from '@/lib/public-booking-time';
import { loadActiveSpecialOpening } from '@/lib/special-opening-server';
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

class BookingCreationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '20');
  const status = searchParams.get('status');
  const date = searchParams.get('date');
  const search = searchParams.get('search');

  const isAdmin = session.user.role === 'ADMIN';

  const where: Record<string, unknown> = {};

  if (!isAdmin) {
    where.userId = session.user.id;
  }
  if (status) where.status = status;
  if (date) where.date = date;

  // bookingType filter (admin only)
  const bookingType = searchParams.get('bookingType');
  if (bookingType && isAdmin) where.bookingType = bookingType;

  if (search && isAdmin) {
    where.OR = [
      { customerName: { contains: search } },
      { user: { name: { contains: search } } },
      { user: { email: { contains: search } } },
      { station: { name: { contains: search } } },
    ];
  }

  const [bookings, total, dayRevenue] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        station: { select: { id: true, name: true } },
        userPass: {
          select: {
            id: true,
            userId: true,
            passType: true,
            totalHours: true,
            usedHours: true,
            status: true,
            expiresAt: true,
          },
        },
      },
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.booking.count({ where }),
    isAdmin && date
      ? prisma.booking.aggregate({
          where: {
            date,
            status: { not: 'CANCELLED' },
          },
          _sum: { totalPrice: true },
        })
      : Promise.resolve(null),
  ]);

  const encryptedBookings = bookings.map((booking) => ({
    ...booking,
    customerPhone: encryptPhone(booking.customerPhone),
  }));

  return NextResponse.json({
    bookings: encryptedBookings,
    total,
    page,
    limit,
    dayRevenue: isAdmin && date
      ? dayRevenue?._sum.totalPrice ?? 0
      : null,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = session.user.role === 'ADMIN';

  try {
    const body = await req.json();
    const result = bookingSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', issues: result.error.issues }, { status: 400 });
    }

    const { stationId, date, startTime, duration, notes } = result.data;
    const requestTime = new Date();
    const specialOpening = await loadActiveSpecialOpening(requestTime);
    const timeValidation = validatePublicBookingTime(date, startTime, duration, specialOpening);
    if (!timeValidation.valid) {
      return NextResponse.json(
        { error: timeValidation.reason, code: timeValidation.code },
        { status: 400 },
      );
    }

    const endTime = addHours(startTime, duration);
    const requestedControllers = Number(body.extraControllers ?? 0);
    const extraControllers = Number.isFinite(requestedControllers)
      ? Math.min(3, Math.max(0, Math.trunc(requestedControllers)))
      : 0;
    const usePass: boolean = body.usePass === true;
    const passId: string | null = typeof body.passId === 'string' ? body.passId : null;

    // Check station exists and fetch the booking user's profile in parallel
    const [station, bookingUser] = await Promise.all([
      prisma.station.findUnique({ 
        where: { id: stationId },
        select: { 
          id: true, name: true, hourlyRate: true, minDuration: true,
          isActive: true, hasControllers: true,
        }
      }),
      prisma.user.findUnique({
        where: { id: session.user.id! },
        select: {
          name: true,
          phone: true,
          passes: {
            where: {
              passType: { in: [...GUILD_MEMBERSHIP_TYPES] },
              status: 'ACTIVE',
              expiresAt: { gte: requestTime },
            },
            select: {
              id: true,
              passType: true,
              status: true,
              purchasedAt: true,
              expiresAt: true,
            },
            orderBy: { expiresAt: 'desc' },
          },
        },
      }),
    ]);
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
    const activeMembership = selectPreferredGuildMembership(
      bookingUser?.passes ?? [],
      requestTime,
    );

    // Server-side guard: ignore controller add-ons for stations that don't support them
    const safeExtraControllers = station.hasControllers ? extraControllers : 0;

    // Reject bookings only if slot start is more than 15 mins in the past (skip for admins)
    if (
      !isAdmin
      && isBookingStartPastInIndia(date, startTime)
    ) {
      return NextResponse.json(
        { error: 'Cannot book a time slot that has already passed.' },
        { status: 400 }
      );
    }

    const requestedInterval = { startTime, endTime };

    // Controller price from settings
    let controllerUnitPrice = 0;
    if (safeExtraControllers > 0) {
      const setting = await prisma.setting.findUnique({ where: { key: 'controller_price' } });
      controllerUnitPrice = parseFloat(setting?.value ?? '0');
    }
    const controllerCharge = safeExtraControllers * controllerUnitPrice * duration;

    if (usePass) {
      if (!isPassDateEligible(date)) {
        return NextResponse.json(
          { error: PASS_WEEKDAY_ONLY_ERROR, code: 'PASS_WEEKDAY_ONLY' },
          { status: 400 }
        );
      }

    }

    const outcome = await runSerializableTransaction(async (tx) => {
      const [capacitySetting, allBookingsToday] = await Promise.all([
        tx.setting.findUnique({ where: { key: 'venue_capacity' } }),
        tx.booking.findMany({
          where: { date, status: { not: 'CANCELLED' } },
          select: { stationId: true, startTime: true, endTime: true },
        }),
      ]);

      if (hasBookingConflict(
        requestedInterval,
        allBookingsToday.filter((booking) => booking.stationId === stationId),
      )) {
        throw new BookingCreationError(
          'This time slot is already booked. Please choose a different time.',
          409,
          'STATION_CONFLICT',
        );
      }
      if (isVenueAtCapacityDuring(
        requestedInterval,
        allBookingsToday,
        capacitySetting?.value,
      )) {
        throw new BookingCreationError(
          'The venue is fully booked at this time. Please choose a different slot.',
          409,
          'VENUE_FULL',
        );
      }

      let userPassId: string | null = null;
      let passHoursDeducted = 0;
      let usedPassType: string | null = null;
      let sessionPrice = station.hourlyRate * duration;

      if (usePass) {
        const pass = passId
          ? await tx.userPass.findFirst({
              where: {
                id: passId,
                userId: session.user.id!,
                status: 'ACTIVE',
                expiresAt: { gte: requestTime },
              },
            })
          : (await tx.userPass.findMany({
              where: {
                userId: session.user.id!,
                status: 'ACTIVE',
                expiresAt: { gte: requestTime },
              },
              orderBy: { purchasedAt: 'desc' },
            })).find((candidate) => (
              isPassTypeAllowedForStation(candidate.passType, station.hasControllers)
            )) ?? null;

        if (!pass) {
          throw new BookingCreationError('No active pass found.', 400, 'PASS_NOT_FOUND');
        }
        if (!isPassTypeAllowedForStation(pass.passType, station.hasControllers)) {
          throw new BookingCreationError(
            'This pass cannot be used on the selected station.',
            400,
            'PASS_STATION_MISMATCH',
          );
        }

        const remaining = pass.totalHours - pass.usedHours;
        if (remaining + Number.EPSILON < duration) {
          throw new BookingCreationError(
            `Not enough pass hours. You have ${remaining} hr(s) remaining but need ${duration} hr(s).`,
            400,
            'PASS_HOURS_INSUFFICIENT',
          );
        }

        const newUsedHours = pass.usedHours + duration;
        await tx.userPass.update({
          where: { id: pass.id },
          data: {
            usedHours: newUsedHours,
            status: newUsedHours >= pass.totalHours ? 'EXHAUSTED' : 'ACTIVE',
          },
        });
        userPassId = pass.id;
        passHoursDeducted = duration;
        usedPassType = pass.passType;
        sessionPrice = 0;
      }

      const booking = await tx.booking.create({
        data: {
          userId: session.user.id,
          stationId,
          date,
          startTime,
          endTime,
          duration,
          totalPrice: sessionPrice + controllerCharge,
          discount: 0,
          notes: notes || null,
          status: 'CONFIRMED',
          bookingType: 'ONLINE',
          paymentStatus: usePass ? 'PAID' : 'UNPAID',
          extraControllers: safeExtraControllers,
          controllerCharge,
          userPassId,
          passHoursDeducted,
          customerName: bookingUser?.name ?? null,
          customerPhone: bookingUser?.phone ?? null,
        },
        include: {
          station: true,
          user: { select: { name: true, email: true } },
        },
      });

      return { booking, passHoursDeducted, usedPassType };
    });
    const { booking, passHoursDeducted, usedPassType } = outcome;

    const notificationPayload = {
      bookingId:        booking.id,
      customerName:     booking.customerName ?? booking.user?.name ?? 'Unknown',
      customerEmail:    booking.user?.email ?? null,
      customerPhone:    booking.customerPhone ?? null,
      stationName:      booking.station.name,
      date:             booking.date,
      startTime:        booking.startTime,
      endTime:          booking.endTime,
      duration:         booking.duration,
      totalPrice:       booking.totalPrice,
      discount:         0,
      bookingType:      booking.bookingType,
      extraControllers: booking.extraControllers,
      passType:         usedPassType,
      passHoursDeducted,
      membershipType: usePass ? null : activeMembership?.passType ?? null,
      membershipExpiresAt: usePass ? null : activeMembership?.expiresAt ?? null,
      appliedBenefitType: null,
      normalPrice: station.hourlyRate * duration + controllerCharge,
      notes:            booking.notes,
    };

    // Send admin and customer confirmations after responding to the booking request.
    after(async () => {
      await Promise.all([
        notifyAdminNewBooking(notificationPayload),
        booking.user?.email
          ? notifyUserNewBooking({
              ...notificationPayload,
              customerEmail: booking.user.email,
              paymentStatus: booking.paymentStatus,
            })
          : Promise.resolve(),
      ]);
    });

    return NextResponse.json({
      booking: { ...booking, customerPhone: encryptPhone(booking.customerPhone) },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof BookingCreationError) {
      return NextResponse.json(
        { error: error.message, ...(error.code ? { code: error.code } : {}) },
        { status: error.status },
      );
    }
    console.error('Booking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
