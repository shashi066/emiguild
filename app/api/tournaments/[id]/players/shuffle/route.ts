import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const players = await prisma.tournamentPlayer.findMany({
    where: { tournamentId: id },
  });

  // Fisher-Yates shuffle
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Reassign seeds
  await Promise.all(
    shuffled.map((p, idx) =>
      prisma.tournamentPlayer.update({
        where: { id: p.id },
        data: { seed: idx },
      })
    )
  );

  const updated = await prisma.tournamentPlayer.findMany({
    where: { tournamentId: id },
    orderBy: { seed: 'asc' },
  });

  return NextResponse.json({ players: updated });
}
