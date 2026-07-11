import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { encryptPhone } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: id },
      orderBy: { seed: 'asc' },
    });
    
    const encryptedPlayers = players.map(p => ({
      ...p,
      phone: encryptPhone(p.phone)
    }));
    
    return NextResponse.json({ players: encryptedPlayers });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: String(error), stack: error?.stack }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { name, phone, userId } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Player name is required' }, { status: 400 });
  }

  // Get the current max seed for this tournament
  const maxSeedPlayer = await prisma.tournamentPlayer.findFirst({
    where: { tournamentId: id },
    orderBy: { seed: 'desc' },
  });

  const nextSeed = (maxSeedPlayer?.seed ?? -1) + 1;

  const player = await prisma.tournamentPlayer.create({
    data: {
      tournamentId: id,
      userId: userId || null,
      name: name.trim(),
      phone: phone?.trim() || null,
      seed: nextSeed,
    },
  });

  return NextResponse.json({ player: { ...player, phone: encryptPhone(player.phone) } }, { status: 201 });
}
