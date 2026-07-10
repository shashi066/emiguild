import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      players: { orderBy: { seed: 'asc' } },
      matches: {
        include: {
          player1: true,
          player2: true,
          winner: true,
        },
        orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
      },
      _count: { select: { players: true } },
    },
  });

  if (!tournament) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ tournament });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, game, date, entryFee, prizePool, maxPlayers, status } = body;

  const tournament = await prisma.tournament.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(game !== undefined && { game }),
      ...(date !== undefined && { date }),
      ...(entryFee !== undefined && { entryFee: String(entryFee) }),
      ...(prizePool !== undefined && { prizePool: String(prizePool) }),
      ...(maxPlayers !== undefined && { maxPlayers }),
      ...(status !== undefined && { status }),
    },
  });

  return NextResponse.json({ tournament });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await prisma.tournament.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
