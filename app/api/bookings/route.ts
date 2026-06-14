import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { bookingSchema } from '@/lib/validations';
import { addHours } from '@/lib/utils';

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

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        station: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  return NextResponse.json({ bookings, total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const result = bookingSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', issues: result.error.issues }, { status: 400 });
    }

    const { stationId, date, startTime, duration, notes } = result.data;
    const endTime = addHours(startTime, duration);
    const extraControllers = Math.min(3, Math.max(0, parseInt(String(body.extraControllers ?? 0))));
    const usePass: boolean = body.usePass === true;

    // Check station exists
    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station || !station.isActive) {
      return NextResponse.json({ error: 'Station not found or inactive' }, { status: 404 });
    }

    // Reject bookings for past time slots on today's date
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    if (date === todayStr) {
      const [slotHour, slotMin] = startTime.split(':').map(Number);
      const slotTotalMins = slotHour * 60 + slotMin;
      const nowTotalMins = today.getHours() * 60 + today.getMinutes();
      if (slotTotalMins <= nowTotalMins) {
        return NextResponse.json(
          { error: 'Cannot book a time slot that has already passed.' },
          { status: 400 }
        );
      }
    }

    // Check for conflicts
    const conflictingBookings = await prisma.booking.findMany({
      where: { stationId, date, status: { not: 'CANCELLED' } },
    });

    const [startH] = startTime.split(':').map(Number);
    const [endH]   = endTime.split(':').map(Number);

    for (const existing of conflictingBookings) {
      const [existStartH] = existing.startTime.split(':').map(Number);
      const [existEndH]   = existing.endTime.split(':').map(Number);
      if (startH < existEndH && endH > existStartH) {
        return NextResponse.json(
          { error: 'This time slot is already booked. Please choose a different time.' },
          { status: 409 }
        );
      }
    }

    // Controller price from settings
    let controllerUnitPrice = 0;
    if (extraControllers > 0) {
      const setting = await prisma.setting.findUnique({ where: { key: 'controller_price' } });
      controllerUnitPrice = parseFloat(setting?.value ?? '0');
    }
    const controllerCharge = extraControllers * controllerUnitPrice * duration;

    // ── Pass logic ────────────────────────────────────────────────────────
    let userPassId: string | null = null;
    let passHoursDeducted = 0;
    let sessionPrice = station.hourlyRate * duration;

    if (usePass) {
      const now = new Date();
      const pass = await prisma.userPass.findFirst({
        where: {
          userId: session.user.id!,
          status: 'ACTIVE',
          expiresAt: { gte: now },
        },
        orderBy: { purchasedAt: 'desc' },
      });

      if (!pass) {
        return NextResponse.json({ error: 'No active pass found.' }, { status: 400 });
      }

      const remaining = pass.totalHours - pass.usedHours;
      if (remaining < duration) {
        return NextResponse.json(
          { error: `Not enough pass hours. You have ${remaining} hr(s) remaining but need ${duration} hr(s).` },
          { status: 400 }
        );
      }

      const newUsedHours = pass.usedHours + duration;
      const newStatus = newUsedHours >= pass.totalHours ? 'EXHAUSTED' : 'ACTIVE';
      await prisma.userPass.update({
        where: { id: pass.id },
        data: { usedHours: newUsedHours, status: newStatus },
      });

      userPassId        = pass.id;
      passHoursDeducted = duration;
      sessionPrice      = 0; // covered by pass
    }

    const totalPrice = sessionPrice + controllerCharge;

    const booking = await prisma.booking.create({
      data: {
        userId:           session.user.id,
        stationId,
        date,
        startTime,
        endTime,
        duration,
        totalPrice,
        notes:            notes ?? null,
        status:           'CONFIRMED',
        bookingType:      'ONLINE',
        paymentStatus:    usePass ? 'PAID' : 'UNPAID',
        extraControllers,
        controllerCharge,
        userPassId,
        passHoursDeducted,
      },
      include: {
        station: true,
        user: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error('Booking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
