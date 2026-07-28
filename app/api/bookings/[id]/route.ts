import { after, NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { updateBookingSchema } from '@/lib/validations';
import { addHours } from '@/lib/utils';
import { encryptPhone } from '@/lib/crypto';
import { checkInBookingWithArtifact, friendlyArmoryError } from '@/lib/armory';
import { notifyUserArtifactAward } from '@/lib/notify';
import {
  isGuildMembershipType,
  validateGuildBenefitApplication,
} from '@/lib/guild-membership';
import { findActiveGuildMembership } from '@/lib/guild-membership-server';
import {
  calculateHourPassUsageUpdates,
  getHourPassStatusAfterUsage,
  validateHourPassApplication,
} from '@/lib/hour-pass';

type BookingBenefitMode = 'STANDARD' | 'HOUR_PASS' | 'GUILD';

class BookingUpdateError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function runSerializable<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'P2034'
      );
      if (!retryable || attempt === 2) throw error;
    }
  }

  throw new Error('Serializable transaction retry limit reached.');
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      station: true,
    },
  });

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const isOwner = booking.userId === session.user.id;
  const isAdmin = session.user.role === 'ADMIN';
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({
    booking: { ...booking, customerPhone: encryptPhone(booking.customerPhone) },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const isOwner = booking.userId === session.user.id;
  const isAdmin = session.user.role === 'ADMIN';

  const body = await req.json();

  // Users can only cancel their own bookings
  if (!isAdmin) {
    if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (body.status !== 'CANCELLED') {
      return NextResponse.json({ error: 'Users can only cancel bookings' }, { status: 403 });
    }
  }

  const result = updateBookingSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }

  if (isAdmin && result.data.status === 'CHECKED_IN') {
    try {
      const outcome = await checkInBookingWithArtifact(id);
      const artifact = outcome.artifactAward.artifact;
      if (outcome.artifactAward.awarded && artifact && outcome.booking.user?.email) {
        after(async () => {
          await notifyUserArtifactAward({
            bookingId: outcome.booking.id,
            customerName: outcome.booking.user?.name ?? outcome.booking.customerName ?? 'Guild member',
            customerEmail: outcome.booking.user!.email,
            stationName: outcome.booking.station.name,
            date: outcome.booking.date,
            startTime: outcome.booking.startTime,
            endTime: outcome.booking.endTime,
            duration: outcome.booking.duration,
            artifactName: artifact.name,
            setName: artifact.set.name,
            rarity: artifact.set.rarity,
            slotType: artifact.slotType,
          });
        });
      }
      return NextResponse.json({
        booking: { ...outcome.booking, customerPhone: encryptPhone(outcome.booking.customerPhone) },
        artifactAward: outcome.artifactAward,
      });
    } catch (error) {
      console.error('Booking check-in artifact award failed:', error);
      const friendly = friendlyArmoryError(error);
      return NextResponse.json({ error: friendly.error }, { status: friendly.status });
    }
  }

  const updateData = {
    status: result.data.status,
    ...(result.data.status === 'CANCELLED'
      ? { adminComment: result.data.adminComment ?? null }
      : {}),
  };
  const include = {
    user: { select: { name: true, email: true } },
    station: { select: { name: true } },
  } satisfies Prisma.BookingInclude;

  // Restore a pass reservation once, in the same transaction that cancels the booking.
  const updated = result.data.status === 'CANCELLED'
    ? await runSerializable(async (tx) => {
        const currentBooking = await tx.booking.findUnique({ where: { id } });
        if (!currentBooking) {
          throw new BookingUpdateError('Booking not found', 404);
        }

        if (
          currentBooking.status !== 'CANCELLED'
          && currentBooking.userPassId
          && currentBooking.passHoursDeducted > 0
        ) {
          const pass = await tx.userPass.findUnique({
            where: { id: currentBooking.userPassId },
          });
          if (pass) {
            const restoredUsedHours = Math.max(
              0,
              pass.usedHours - currentBooking.passHoursDeducted,
            );
            await tx.userPass.update({
              where: { id: pass.id },
              data: {
                usedHours: restoredUsedHours,
                status: getHourPassStatusAfterUsage({
                  currentStatus: pass.status,
                  expiresAt: pass.expiresAt,
                  totalHours: pass.totalHours,
                  usedHours: restoredUsedHours,
                  selected: false,
                }),
              },
            });
          }
        }

        return tx.booking.update({
          where: { id },
          data: updateData,
          include,
        });
      })
    : await prisma.booking.update({
        where: { id },
        data: updateData,
        include,
      });

  return NextResponse.json({
    booking: { ...updated, customerPhone: encryptPhone(updated.customerPhone) },
  });
}


// Admin-only: full booking edit (date, time, station, notes, etc.)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { station: true },
  });
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const body = await req.json();
  const {
    date,
    stationId,
    startTime,
    notes,
    customerName,
    customerPhone,
    discount: rawDiscount,
  } = body;
  const duration = Number(body.duration);
  const requestedControllers = Number(body.extraControllers ?? booking.extraControllers);
  const discount = Math.min(
    100,
    Math.max(0, parseInt(String(rawDiscount ?? 0), 10) || 0),
  );
  const requestedBenefit = body.appliedBenefitType;
  const rawBenefitMode = body.benefitMode;
  const legacyRequest = rawBenefitMode == null;

  if (
    typeof date !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || typeof stationId !== 'string'
    || !stationId
    || typeof startTime !== 'string'
    || !/^\d{2}:\d{2}$/.test(startTime)
    || !Number.isFinite(duration)
    || duration < 0.5
    || duration > 12
    || !Number.isInteger(duration * 2)
    || !Number.isFinite(requestedControllers)
  ) {
    return NextResponse.json({ error: 'date, stationId, startTime and duration are required' }, { status: 400 });
  }

  let benefitMode: BookingBenefitMode;
  if (legacyRequest) {
    benefitMode = booking.userPassId && booking.passHoursDeducted > 0
      ? 'HOUR_PASS'
      : requestedBenefit != null
        ? 'GUILD'
        : 'STANDARD';
  } else if (
    rawBenefitMode === 'STANDARD'
    || rawBenefitMode === 'HOUR_PASS'
    || rawBenefitMode === 'GUILD'
  ) {
    benefitMode = rawBenefitMode;
  } else {
    return NextResponse.json(
      { error: 'Invalid booking benefit selection.', code: 'INVALID_BENEFIT' },
      { status: 400 },
    );
  }

  const requestedHourPassId = typeof body.hourPassId === 'string' && body.hourPassId.trim()
    ? body.hourPassId.trim()
    : legacyRequest
      ? booking.userPassId
      : null;

  if (benefitMode === 'HOUR_PASS') {
    if (!requestedHourPassId || !booking.userId) {
      return NextResponse.json(
        { error: 'Select a customer pass for this linked booking.', code: 'PASS_NOT_FOUND' },
        { status: 400 },
      );
    }
    if (discount > 0 || requestedBenefit != null) {
      return NextResponse.json(
        { error: 'A pass cannot be combined with another discount.', code: 'BENEFIT_STACKING' },
        { status: 400 },
      );
    }
  } else if (benefitMode === 'STANDARD' && requestedBenefit != null) {
    return NextResponse.json(
      { error: 'Invalid booking benefit selection.', code: 'INVALID_BENEFIT' },
      { status: 400 },
    );
  }

  const endTime = addHours(startTime, duration);

  const station = await prisma.station.findUnique({ 
    where: { id: stationId },
    select: { 
      id: true, name: true, hourlyRate: true, isActive: true, hasControllers: true,
    }
  });
  if (!station || !station.isActive) {
    return NextResponse.json({ error: 'Station not found or inactive' }, { status: 404 });
  }

  // Recalculate controller charge with current setting price
  const numControllers = station.hasControllers
    ? Math.min(3, Math.max(0, Math.trunc(requestedControllers)))
    : 0;
  let controllerUnitPrice = 0;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'controller_price' } });
    controllerUnitPrice = parseFloat(setting?.value ?? '0');
  } catch { /* use 0 */ }

  const sessionCost = station.hourlyRate * duration;
  const controllerCharge = numControllers * controllerUnitPrice * duration;
  const storedDiscount = benefitMode === 'HOUR_PASS' ? 0 : discount;
  const totalPrice = benefitMode === 'HOUR_PASS'
    ? Math.round(controllerCharge)
    : Math.round((sessionCost + controllerCharge) * (1 - storedDiscount / 100));
  let appliedBenefitType: string | null = null;

  if (benefitMode === 'GUILD') {
    const membership = booking.userId && isGuildMembershipType(requestedBenefit)
      ? await findActiveGuildMembership(booking.userId, requestedBenefit)
      : null;
    const validation = validateGuildBenefitApplication({
      requestedBenefit,
      membership,
      bookingDate: date,
      hasControllers: station.hasControllers,
      extraControllers: numControllers,
      discount: storedDiscount,
      hasLinkedUser: Boolean(booking.userId),
      hasHourPass: false,
    });
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.reason, code: validation.code },
        { status: 400 }
      );
    }
    appliedBenefitType = validation.benefitType;
  }

  // ── Conflict Checks ───────────────────────────────────────────
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const startMins = toMins(startTime);
  const endMins = toMins(endTime);

  // Check for conflicts on the target station (excluding current booking)
  const conflictingBookings = await prisma.booking.findMany({
    where: {
      id: { not: id },
      stationId,
      date,
      status: { not: 'CANCELLED' },
    },
  });

  for (const existing of conflictingBookings) {
    const exStartMins = toMins(existing.startTime);
    const exEndMins = toMins(existing.endTime);
    if (startMins < exEndMins && endMins > exStartMins) {
      return NextResponse.json(
        { error: 'This time slot conflicts with another booking on this station.' },
        { status: 409 }
      );
    }
  }

  // ── Venue Capacity Check ──────────────────────────────────────────────
  // Count all active bookings overlapping this slot across ALL stations (excluding current booking).
  const capacitySetting = await prisma.setting.findUnique({ where: { key: 'venue_capacity' } });
  const venueCapacity   = parseInt(capacitySetting?.value ?? '2');

  const allOverlapping = await prisma.booking.findMany({
    where: { id: { not: id }, date, status: { not: 'CANCELLED' } },
    select: { startTime: true, endTime: true },
  });

  const overlapCount = allOverlapping.filter(b => {
    const bStart = toMins(b.startTime);
    const bEnd   = toMins(b.endTime);
    return startMins < bEnd && endMins > bStart;
  }).length;

  if (overlapCount >= venueCapacity) {
    return NextResponse.json(
      { error: 'The venue is fully booked at this time. Please choose a different slot.' },
      { status: 409 }
    );
  }

  try {
    const updated = await runSerializable(async (tx) => {
      const currentBooking = await tx.booking.findUnique({
        where: { id },
        include: { userPass: true },
      });
      if (!currentBooking) {
        throw new BookingUpdateError('Booking not found', 404);
      }
      if (!['PENDING', 'CONFIRMED'].includes(currentBooking.status)) {
        throw new BookingUpdateError(
          'Only pending or confirmed bookings can be edited.',
          409,
          'BOOKING_NOT_EDITABLE',
        );
      }

      const currentPass = (
        currentBooking.userPassId
        && currentBooking.passHoursDeducted > 0
      )
        ? currentBooking.userPass
        : null;
      const selectedPass = benefitMode === 'HOUR_PASS' && requestedHourPassId
        ? await tx.userPass.findFirst({
            where: {
              id: requestedHourPassId,
              userId: currentBooking.userId!,
            },
          })
        : null;

      if (benefitMode === 'HOUR_PASS') {
        const validation = validateHourPassApplication({
          pass: selectedPass,
          userId: currentBooking.userId,
          bookingDate: date,
          duration,
          hasControllers: station.hasControllers,
          currentPassId: currentPass?.id ?? null,
          currentPassHours: currentBooking.passHoursDeducted,
        });
        if (!validation.valid) {
          throw new BookingUpdateError(validation.reason, 400, validation.code);
        }
      }

      const passUpdates = calculateHourPassUsageUpdates({
        currentPass,
        currentPassHours: currentBooking.passHoursDeducted,
        selectedPass,
        selectedHours: selectedPass ? duration : 0,
      });
      for (const update of passUpdates) {
        await tx.userPass.update({
          where: { id: update.id },
          data: {
            usedHours: update.usedHours,
            status: update.status,
          },
        });
      }

      return tx.booking.update({
        where: { id },
        data: {
          date,
          stationId,
          startTime,
          endTime,
          duration,
          extraControllers: numControllers,
          controllerCharge,
          discount: storedDiscount,
          appliedBenefitType,
          totalPrice,
          notes: notes ?? currentBooking.notes,
          customerName: customerName ?? currentBooking.customerName,
          customerPhone: customerPhone ?? currentBooking.customerPhone,
          userPassId: selectedPass?.id ?? null,
          passHoursDeducted: selectedPass ? duration : 0,
        },
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
      });
    });

    return NextResponse.json({
      booking: { ...updated, customerPhone: encryptPhone(updated.customerPhone) },
    });
  } catch (error) {
    if (error instanceof BookingUpdateError) {
      return NextResponse.json(
        { error: error.message, ...(error.code ? { code: error.code } : {}) },
        { status: error.status },
      );
    }
    console.error('Booking edit failed:', error);
    return NextResponse.json(
      { error: 'Failed to update booking.' },
      { status: 500 },
    );
  }
}


export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const { id } = await params;

  await prisma.booking.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
