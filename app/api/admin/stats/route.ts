import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { getAdminRevenue } from '@/lib/admin-revenue';
import { getTodayString } from '@/lib/utils';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const today = getTodayString();

  const [
    totalBookings, todayBookings, pendingBookings,
    totalUsers, activeStations, revenue,
  ] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { date: today } }),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.station.count({ where: { isActive: true } }),
    getAdminRevenue(),
  ]);

  return NextResponse.json({
    totalBookings,
    todayBookings,
    pendingBookings,
    totalUsers,
    activeStations,
    totalRevenue: revenue.revenue,
    bookingRevenue: revenue.bookingRevenue,
    rentalRevenue: revenue.rentalRevenue,
    rentalCount: revenue.rentalCount,
  });
}
