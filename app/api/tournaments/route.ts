import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function GET() {
  const tournaments = await prisma.tournament.findMany({
    include: {
      _count: { select: { players: true, matches: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ tournaments });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, game, date, entryFee, prizePool, maxPlayers } = body;

  if (!name || !date) {
    return NextResponse.json({ error: 'name and date are required' }, { status: 400 });
  }

  const tournament = await prisma.tournament.create({
    data: {
      name,
      game: game || 'FC26',
      date,
      entryFee: entryFee || 'Free',
      prizePool: prizePool || '',
      maxPlayers: maxPlayers || 16,
    },
  });

  return NextResponse.json({ tournament }, { status: 201 });
}
