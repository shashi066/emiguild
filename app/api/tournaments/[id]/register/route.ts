import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '../../../../../lib/prisma';
import { encryptPhone } from '@/lib/crypto';

// POST /api/tournaments/[id]/register  — logged-in user self-registers
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { id } = await params;
  try {

  // Get tournament
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { _count: { select: { players: true } } },
  });

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
  }
  if (tournament.status !== 'REGISTRATION_OPEN') {
    return NextResponse.json({ error: 'Registration is not open' }, { status: 400 });
  }
  if (tournament._count.players >= tournament.maxPlayers) {
    return NextResponse.json({ error: 'Tournament is full' }, { status: 400 });
  }

  // Check if already registered
  const existing = await prisma.tournamentPlayer.findFirst({
    where: { tournamentId: id, userId: session.user.id },
  });
  if (existing) {
    return NextResponse.json({ error: 'Already registered' }, { status: 400 });
  }

  // Get current player count for seed
  const count = await prisma.tournamentPlayer.count({ where: { tournamentId: id } });

  // Fetch user for phone
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { phone: true }
  });

  const player = await prisma.tournamentPlayer.create({
    data: {
      tournamentId: id,
      userId: session.user.id,
      name: session.user.name || 'Player',
      phone: user?.phone || null,
      seed: count,
    },
  });

  return NextResponse.json({ player: { ...player, phone: encryptPhone(player.phone) } }, { status: 201 });
  } catch (error: any) {
    console.error("REGISTER ERROR:", error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

// DELETE /api/tournaments/[id]/register  — logged-in user withdraws
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
  }

  // Only allow withdrawal if registration still open and bracket not generated
  if (tournament.bracketGenerated) {
    return NextResponse.json({ error: 'Bracket already generated, cannot withdraw' }, { status: 400 });
  }

  const player = await prisma.tournamentPlayer.findFirst({
    where: { tournamentId: id, userId: session.user.id },
  });

  if (!player) {
    return NextResponse.json({ error: 'Not registered' }, { status: 404 });
  }

  await prisma.tournamentPlayer.delete({ where: { id: player.id } });

  // Re-number seeds
  const remaining = await prisma.tournamentPlayer.findMany({
    where: { tournamentId: id },
    orderBy: { seed: 'asc' },
  });
  await Promise.all(
    remaining.map((p, i) =>
      prisma.tournamentPlayer.update({ where: { id: p.id }, data: { seed: i } })
    )
  );

  return NextResponse.json({ success: true });
}
