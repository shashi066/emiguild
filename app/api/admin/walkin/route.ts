import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { addHours } from '@/lib/utils';
import { z } from 'zod';

const walkinSchema = z.object({
  customerName:     z.string().min(1, 'Customer name is required'),
  customerPhone:    z.string().optional(),
  stationId:        z.string().min(1),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime:        z.string().regex(/^\d{2}:\d{2}$/),
  duration:         z.number().int().min(1).max(12),
  extraControllers: z.number().int().min(0).max(3).optional(),
  notes:            z.string().optional(),
  status:           z.enum(['PENDING', 'CONFIRMED']).optional(),
  usePass:          z.boolean().optional(),
  linkedUserId:     z.string().optional(), // registered user's id (for pass lookup)
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

  return NextResponse.json({ bookings, total });
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
    const endTime = addHours(startTime, duration);
    const extraControllers = Math.min(3, Math.max(0, rawExtra ?? 0));

    // Check station exists and is active
    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station || !station.isActive) {
      return NextResponse.json({ error: 'Station not found or inactive' }, { status: 404 });
    }

    // Conflict detection (same as regular bookings)
    const conflicts = await prisma.booking.findMany({
      where: { stationId, date, status: { not: 'CANCELLED' } },
    });

    const [startH] = startTime.split(':').map(Number);
    const [endH]   = endTime.split(':').map(Number);

    for (const b of conflicts) {
      const [bStart] = b.startTime.split(':').map(Number);
      const [bEnd]   = b.endTime.split(':').map(Number);
      if (startH < bEnd && endH > bStart) {
        const who = b.bookingType === 'OFFLINE' ? 'another walk-in customer' : 'an online customer';
        return NextResponse.json(
          { error: `This slot is already booked by ${who}. Please choose a different time.` },
          { status: 409 }
        );
      }
    }

    const { usePass, linkedUserId } = result.data;

    // Fetch controller price from settings
    let controllerUnitPrice = 0;
    if (extraControllers > 0) {
      const setting = await prisma.setting.findUnique({ where: { key: 'controller_price' } });
      controllerUnitPrice = parseFloat(setting?.value ?? '0');
    }
    const controllerCharge = extraControllers * controllerUnitPrice * duration;

    // ── Pass logic ─────────────────────────────────────────────────────────
    let userPassId: string | null = null;
    let passHoursDeducted = 0;
    let sessionPrice = station.hourlyRate * duration;

    if (usePass && linkedUserId) {
      const now = new Date();
      const pass = await prisma.userPass.findFirst({
        where: {
          userId: linkedUserId,
          status: 'ACTIVE',
          expiresAt: { gte: now },
        },
        orderBy: { purchasedAt: 'desc' },
      });

      if (!pass) {
        return NextResponse.json({ error: 'No active pass found for this user.' }, { status: 400 });
      }
      const remaining = pass.totalHours - pass.usedHours;
      if (remaining < duration) {
        return NextResponse.json(
          { error: `Not enough pass hours. ${remaining} hr(s) remaining, need ${duration}.` },
          { status: 400 }
        );
      }

      const newUsed = pass.usedHours + duration;
      await prisma.userPass.update({
        where: { id: pass.id },
        data: { usedHours: newUsed, status: newUsed >= pass.totalHours ? 'EXHAUSTED' : 'ACTIVE' },
      });

      userPassId        = pass.id;
      passHoursDeducted = duration;
      sessionPrice      = 0;
    }

    const totalPrice = sessionPrice + controllerCharge;

    const booking = await prisma.booking.create({
      data: {
        userId:           usePass && linkedUserId ? linkedUserId : session.user.id,
        stationId,
        date,
        startTime,
        endTime,
        duration,
        totalPrice,
        status:           status ?? 'CONFIRMED',
        bookingType:      'OFFLINE',
        customerName,
        customerPhone:    customerPhone ?? null,
        paymentStatus:    usePass ? 'PAID' : 'UNPAID',
        extraControllers,
        controllerCharge,
        notes:            notes ?? null,
        userPassId,
        passHoursDeducted,
      },
      include: {
        station: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error('Walk-in booking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
