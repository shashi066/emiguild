import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;

  const [
    totalBookings, todayBookings, pendingBookings,
    totalUsers, activeStations, revenue,
  ] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { date: today } }),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.station.count({ where: { isActive: true } }),
    prisma.booking.aggregate({
      where: { status: { not: 'CANCELLED' } },
      _sum: { totalPrice: true },
    }),
  ]);

  return NextResponse.json({
    totalBookings,
    todayBookings,
    pendingBookings,
    totalUsers,
    activeStations,
    totalRevenue: revenue._sum.totalPrice ?? 0,
  });
}
