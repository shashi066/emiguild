import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// GET /api/user/pass — get current user's active pass
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ pass: null });
  }

  try {
    const now = new Date();

    // Auto-expire any passes that have passed their expiresAt date
    await prisma.userPass.updateMany({
      where: {
        userId: session.user.id,
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    const pass = await prisma.userPass.findFirst({
      where: {
        userId: session.user.id,
        status: 'ACTIVE',
        expiresAt: { gte: now },
      },
      include: {
        bookings: {
          where: { passHoursDeducted: { gt: 0 } },
          select: {
            id: true, date: true, startTime: true, endTime: true,
            passHoursDeducted: true, status: true,
            station: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { purchasedAt: 'desc' },
    });

    return NextResponse.json({ pass });
  } catch (err) {
    console.error('[/api/user/pass] DB error:', err);
    return NextResponse.json({ pass: null });
  }
}
