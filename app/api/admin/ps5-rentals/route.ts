import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// GET — all rentals (admin only)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const page = Math.max(1, Math.min(100000, Number(searchParams.get('page')) || 1));
  if (!Number.isInteger(page)) return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
  const pageSize = 25;

  const rentals = await prisma.ps5Rental.findMany({
    where: status && status !== 'ALL' ? { status } : undefined,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
    include: {
      user: { select: { email: true } },
    },
  });

  return NextResponse.json({ rentals: rentals.slice(0, pageSize), page, hasMore: rentals.length > pageSize });
}
