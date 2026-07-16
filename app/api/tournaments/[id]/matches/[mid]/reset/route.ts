import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, mid } = await params;

  const match = await prisma.tournamentMatch.findUnique({ where: { id: mid } });
  if (!match || match.tournamentId !== id) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }

  if (match.isBye) {
    return NextResponse.json({ error: 'Cannot reset a BYE match' }, { status: 400 });
  }

  // Reset scores, winner, status
  const resetMatch = await prisma.tournamentMatch.update({
    where: { id: mid },
    data: { score1: 0, score2: 0, winnerId: null, status: 'PENDING' },
    include: { player1: true, player2: true, winner: true },
  });

  // Clear the winner slot in the next round
  const nextRound = match.round + 1;
  const nextMatchIndex = Math.floor(match.matchIndex / 2);
  const isPlayer1Slot = match.matchIndex % 2 === 0;

  const nextMatch = await prisma.tournamentMatch.findFirst({
    where: { tournamentId: id, round: nextRound, matchIndex: nextMatchIndex },
  });

  if (nextMatch) {
    await prisma.tournamentMatch.update({
      where: { id: nextMatch.id },
      data: {
        ...(isPlayer1Slot ? { player1Id: null } : { player2Id: null }),
        winnerId: null,
        status: 'PENDING',
        score1: 0,
        score2: 0,
      },
    });
  }

  // If tournament was FINISHED, revert to ONGOING
  await prisma.tournament.update({
    where: { id },
    data: { status: 'ONGOING' },
  });

  return NextResponse.json({ match: resetMatch });
}
