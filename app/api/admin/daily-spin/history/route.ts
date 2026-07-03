import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date'); // YYYY-MM-DD filter

  const spins = await prisma.userDailySpin.findMany({
    where: date ? { spinDate: date } : undefined,
    include: {
      user:     { select: { name: true, email: true } },
      lootItem: { select: { name: true, rarity: true, description: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return NextResponse.json({ spins });
}
