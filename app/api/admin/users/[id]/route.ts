import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { encryptPhone } from '@/lib/crypto';
import {
  getIstDateTime,
  summarizeUserBookings,
} from '@/lib/admin-user-details';

const bookingPreviewSelect = {
  id: true,
  date: true,
  startTime: true,
  endTime: true,
  duration: true,
  totalPrice: true,
  status: true,
  bookingType: true,
  paymentStatus: true,
  extraControllers: true,
  controllerCharge: true,
  passHoursDeducted: true,
  station: { select: { name: true } },
  userPass: { select: { passType: true } },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        guildGems: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const now = new Date();
    const ist = getIstDateTime(now);
    const [
      statusAggregates,
      recentBookings,
      lastVisit,
      nextBooking,
      activePasses,
    ] = await Promise.all([
      prisma.booking.groupBy({
        by: ['status'],
        where: { userId: id },
        _count: { _all: true },
        _sum: { totalPrice: true, duration: true },
      }),
      prisma.booking.findMany({
        where: { userId: id },
        select: bookingPreviewSelect,
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
        take: 10,
      }),
      prisma.booking.findFirst({
        where: {
          userId: id,
          status: { in: ['CHECKED_IN', 'COMPLETED'] },
        },
        select: bookingPreviewSelect,
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      }),
      prisma.booking.findFirst({
        where: {
          userId: id,
          status: { in: ['PENDING', 'CONFIRMED'] },
          OR: [
            { date: { gt: ist.date } },
            { date: ist.date, startTime: { gte: ist.time } },
          ],
        },
        select: bookingPreviewSelect,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.userPass.findMany({
        where: {
          userId: id,
          status: 'ACTIVE',
          expiresAt: { gte: now },
        },
        select: {
          id: true,
          passType: true,
          totalHours: true,
          usedHours: true,
          expiresAt: true,
        },
        orderBy: { expiresAt: 'asc' },
      }),
    ]);

    return NextResponse.json({
      user: {
        ...user,
        phone: encryptPhone(user.phone),
      },
      summary: summarizeUserBookings(statusAggregates),
      lastVisit,
      nextBooking,
      activePasses: activePasses.map((pass) => ({
        ...pass,
        remainingHours: Math.max(0, pass.totalHours - pass.usedHours),
      })),
      recentBookings,
    });
  } catch (error) {
    console.error('Failed to load admin user details:', error);
    return NextResponse.json(
      { error: 'Failed to load user details.' },
      { status: 500 },
    );
  }
}
