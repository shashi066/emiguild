import { prisma } from '@/lib/prisma';

export async function advanceTournamentWinner(
  tournamentId: string,
  currentRound: number,
  currentMatchIndex: number,
  winnerId: string
) {
  const nextRound = currentRound + 1;
  const nextMatchIndex = Math.floor(currentMatchIndex / 2);
  const isPlayer1Slot = currentMatchIndex % 2 === 0;

  const nextMatch = await prisma.tournamentMatch.findFirst({
    where: { tournamentId, round: nextRound, matchIndex: nextMatchIndex },
  });

  if (!nextMatch) return;

  await prisma.tournamentMatch.update({
    where: { id: nextMatch.id },
    data: isPlayer1Slot ? { player1Id: winnerId } : { player2Id: winnerId },
  });
}
