import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { updateBookingSchema } from '@/lib/validations';
import { addHours } from '@/lib/utils';

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

  return NextResponse.json({ booking });
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

  // ── Restore pass hours if cancelling a pass-backed booking ───────────
  if (result.data.status === 'CANCELLED' && booking.userPassId && booking.passHoursDeducted > 0) {
    const pass = await prisma.userPass.findUnique({ where: { id: booking.userPassId } });
    if (pass) {
      const restoredUsedHours = Math.max(0, pass.usedHours - booking.passHoursDeducted);
      const restoredStatus = pass.status === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE';
      await prisma.userPass.update({
        where: { id: pass.id },
        data: { usedHours: restoredUsedHours, status: restoredStatus },
      });
    }
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: result.data.status,
      ...(result.data.status === 'CANCELLED'
        ? { adminComment: result.data.adminComment ?? null }
        : {}),
    },
    include: {
      user: { select: { name: true, email: true } },
      station: { select: { name: true } },
    },
  });

  return NextResponse.json({ booking: updated });
}


// Admin-only: full booking edit (date, time, station, notes, etc.)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const { id } = await params;

  const booking = await prisma.booking.findUnique({ where: { id }, include: { station: true } });
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const body = await req.json();
  const { date, stationId, startTime, duration, notes, customerName, customerPhone, extraControllers, discount: rawDiscount } = body;
  // discount is admin-only; this route is already admin-guarded above
  const discount: number = Math.min(100, Math.max(0, parseInt(String(rawDiscount ?? 0)) || 0));

  if (!date || !stationId || !startTime || !duration) {
    return NextResponse.json({ error: 'date, stationId, startTime and duration are required' }, { status: 400 });
  }

  // Recalculate endTime using addHours to correctly handle 30-min durations
  const endTime = addHours(startTime, Number(duration));

  const station = await prisma.station.findUnique({ 
    where: { id: stationId },
    select: { 
      id: true, name: true, hourlyRate: true, isActive: true, hasControllers: true,
    }
  });
  if (!station) return NextResponse.json({ error: 'Station not found' }, { status: 404 });

  // Recalculate controller charge with current setting price
  const numControllers = Math.min(3, Math.max(0, Number(extraControllers ?? booking.extraControllers)));
  let controllerUnitPrice = 0;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'controller_price' } });
    controllerUnitPrice = parseFloat(setting?.value ?? '0');
  } catch { /* use 0 */ }

  const sessionCost      = station.hourlyRate * Number(duration);
  const controllerCharge = numControllers * controllerUnitPrice * Number(duration);
  const totalPrice       = Math.round((sessionCost + controllerCharge) * (1 - discount / 100));

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

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      date,
      stationId,
      startTime,
      endTime,
      duration:         Number(duration),
      extraControllers: numControllers,
      controllerCharge,
      discount,
      totalPrice,
      notes:         notes         ?? booking.notes,
      customerName:  customerName  ?? booking.customerName,
      customerPhone: customerPhone ?? booking.customerPhone,
    },
    include: {
      user:    { select: { id: true, name: true, email: true } },
      station: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ booking: updated });
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
