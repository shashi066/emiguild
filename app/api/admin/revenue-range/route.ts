import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: 'Valid from and to dates are required.' }, { status: 400 });
  }

  if (from > to) {
    return NextResponse.json({ error: 'Start date must be before end date.' }, { status: 400 });
  }

  const [revenue, bookingCount] = await Promise.all([
    prisma.booking.aggregate({
      where: {
        date: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
      },
      _sum: { totalPrice: true },
    }),
    prisma.booking.count({
      where: {
        date: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
      },
    }),
  ]);

  return NextResponse.json({
    from,
    to,
    revenue: revenue._sum.totalPrice ?? 0,
    bookingCount,
  });
}
