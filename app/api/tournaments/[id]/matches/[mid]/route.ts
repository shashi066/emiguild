import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { advanceTournamentWinner } from '@/lib/tournaments';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, mid } = await params;
  const { score1, score2, status } = await req.json();

  const match = await prisma.tournamentMatch.findUnique({
    where: { id: mid },
    include: { player1: true, player2: true },
  });

  if (!match || match.tournamentId !== id) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }

  // Determine winner if both scores are provided
  let winnerId: string | null = match.winnerId;
  let newStatus = status || match.status;

  if (score1 !== undefined && score2 !== undefined) {
    if (score1 > score2 && match.player1Id) {
      winnerId = match.player1Id;
      newStatus = 'COMPLETED';
    } else if (score2 > score1 && match.player2Id) {
      winnerId = match.player2Id;
      newStatus = 'COMPLETED';
    } else {
      // Tie — no winner yet, set to IN_PROGRESS
      winnerId = null;
      newStatus = score1 === score2 && score1 > 0 ? 'IN_PROGRESS' : match.status;
    }
  }

  const updatedMatch = await prisma.tournamentMatch.update({
    where: { id: mid },
    data: {
      ...(score1 !== undefined && { score1 }),
      ...(score2 !== undefined && { score2 }),
      winnerId,
      status: newStatus,
    },
    include: { player1: true, player2: true, winner: true },
  });

  // If match completed with winner, advance to next round
  if (newStatus === 'COMPLETED' && winnerId) {
    // Check if the winner changed (avoid re-advancing)
    if (match.winnerId !== winnerId) {
      await advanceTournamentWinner(id, match.round, match.matchIndex, winnerId);
    }

    // Check if this was the final match — update tournament status
    const totalMatches = await prisma.tournamentMatch.count({ where: { tournamentId: id } });
    const completedMatches = await prisma.tournamentMatch.count({
      where: { tournamentId: id, status: 'COMPLETED' },
    });

    if (totalMatches === completedMatches) {
      await prisma.tournament.update({
        where: { id },
        data: { status: 'FINISHED' },
      });
    }
  }

  return NextResponse.json({ match: updatedMatch });
}
