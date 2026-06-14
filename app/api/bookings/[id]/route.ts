import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { updateBookingSchema } from '@/lib/validations';

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
  const { date, stationId, startTime, duration, notes, customerName, customerPhone, extraControllers } = body;

  if (!date || !stationId || !startTime || !duration) {
    return NextResponse.json({ error: 'date, stationId, startTime and duration are required' }, { status: 400 });
  }

  // Recalculate endTime
  const [h] = startTime.split(':').map(Number);
  const endHour = h + Number(duration);
  const endTime = `${String(endHour).padStart(2, '0')}:00`;

  const station = await prisma.station.findUnique({ where: { id: stationId } });
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
  const totalPrice       = sessionCost + controllerCharge;

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
