import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { addHours } from '@/lib/utils';
import { z } from 'zod';
import { validateAdminWalkinTime } from '@/lib/admin-walkin-time';
import {
  hasBookingConflict,
  isVenueAtCapacityDuring,
} from '@/lib/booking-availability';
import { runSerializableTransaction } from '@/lib/prisma-transaction';

class FreezeCreationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const freezeSchema = z.object({
  stationId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.number().int().min(1).max(12),
  reason: z.string().trim().max(300).optional(),
});

// GET /api/admin/freeze — list all frozen slots (BLOCKED bookings)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const stationId = searchParams.get('stationId');

  const where: Record<string, unknown> = { status: 'BLOCKED' };
  if (date) where.date = date;
  if (stationId) where.stationId = stationId;

  const frozen = await prisma.booking.findMany({
    where,
    include: { station: { select: { id: true, name: true } } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

  return NextResponse.json({ frozen });
}

// POST /api/admin/freeze — freeze a slot
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const result = freezeSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', issues: result.error.issues }, { status: 400 });
    }

    const { stationId, date, startTime, duration, reason } = result.data;
    const timeValidation = validateAdminWalkinTime(startTime, duration);
    if (!timeValidation.valid) {
      return NextResponse.json(
        { error: timeValidation.reason, code: timeValidation.code },
        { status: 400 },
      );
    }
    const endTime = addHours(startTime, duration);

    const requestedInterval = { startTime, endTime };
    const frozen = await runSerializableTransaction(async (tx) => {
      const [station, capacitySetting, allBookingsToday] = await Promise.all([
        tx.station.findUnique({ where: { id: stationId } }),
        tx.setting.findUnique({ where: { key: 'venue_capacity' } }),
        tx.booking.findMany({
          where: { date, status: { not: 'CANCELLED' } },
          select: { stationId: true, startTime: true, endTime: true, status: true },
        }),
      ]);
      if (!station || !station.isActive) {
        throw new FreezeCreationError(
          'Station not found or inactive',
          404,
          'STATION_NOT_FOUND',
        );
      }

      const stationConflict = allBookingsToday.find((booking) => (
        booking.stationId === stationId
        && hasBookingConflict(requestedInterval, [booking])
      ));
      if (stationConflict) {
        const label = stationConflict.status === 'BLOCKED'
          ? 'already frozen'
          : 'already booked by a customer';
        throw new FreezeCreationError(
          `This slot is ${label}. Please choose a different time.`,
          409,
          'STATION_CONFLICT',
        );
      }
      if (isVenueAtCapacityDuring(
        requestedInterval,
        allBookingsToday,
        capacitySetting?.value,
      )) {
        throw new FreezeCreationError(
          'The venue is fully booked at this time. Please choose a different slot.',
          409,
          'VENUE_FULL',
        );
      }

      return tx.booking.create({
        data: {
          userId: session.user.id,
          stationId,
          date,
          startTime,
          endTime,
          duration,
          totalPrice: 0,
          status: 'BLOCKED',
          notes: reason
            ? `[Walk-in] ${reason}`
            : '[Walk-in] Reserved for offline customer',
        },
        include: { station: { select: { id: true, name: true } } },
      });
    });

    return NextResponse.json({ frozen }, { status: 201 });
  } catch (error) {
    if (error instanceof FreezeCreationError) {
      return NextResponse.json(
        { error: error.message, ...(error.code ? { code: error.code } : {}) },
        { status: error.status },
      );
    }
    console.error('Freeze error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/freeze?id=xxx — unfreeze a slot
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.status !== 'BLOCKED') {
    return NextResponse.json({ error: 'Frozen slot not found' }, { status: 404 });
  }

  await prisma.booking.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
