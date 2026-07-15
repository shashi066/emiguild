import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { advanceTournamentWinner } from '@/lib/tournaments';

/** Returns the next power of 2 >= n */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { players: { orderBy: { seed: 'asc' } } },
  });

  if (!tournament) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const players = tournament.players;
  const playerCount = players.length;

  if (playerCount < 2) {
    return NextResponse.json({ error: 'Need at least 2 players' }, { status: 400 });
  }

  const bracketSize = nextPow2(playerCount);
  const byeCount = bracketSize - playerCount;
  const totalRounds = Math.log2(bracketSize);

  // Delete existing matches
  await prisma.tournamentMatch.deleteMany({ where: { tournamentId: id } });

  // Build round 1 — seed 1 vs seed N pairing (standard bracket seeding)
  // Pad with null BYEs
  const slots: (string | null)[] = [
    ...players.map((p) => p.id),
    ...Array(byeCount).fill(null),
  ];

  // Standard seeding: position 0 plays position bracketSize-1, 1 plays bracketSize-2, etc.
  // But we interleave so top seeds don't meet until later
  const seededSlots = seedBracket(slots);

  const round1Matches = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    const p1 = seededSlots[i * 2];
    const p2 = seededSlots[i * 2 + 1];
    const isBye = p1 === null || p2 === null;
    const winnerId = isBye ? (p1 ?? p2) : null;

    round1Matches.push(
      prisma.tournamentMatch.create({
        data: {
          tournamentId: id,
          round: 1,
          matchIndex: i,
          player1Id: p1,
          player2Id: p2,
          isBye,
          status: isBye ? 'COMPLETED' : 'PENDING',
          winnerId,
        },
      })
    );
  }

  await Promise.all(round1Matches);

  // Create empty placeholder matches for subsequent rounds
  const subsequentRoundCreations = [];
  for (let r = 2; r <= totalRounds; r++) {
    const matchesInRound = bracketSize / Math.pow(2, r);
    for (let i = 0; i < matchesInRound; i++) {
      subsequentRoundCreations.push(
        prisma.tournamentMatch.create({
          data: {
            tournamentId: id,
            round: r,
            matchIndex: i,
            status: 'PENDING',
          },
        })
      );
    }
  }
  await Promise.all(subsequentRoundCreations);

  // Now advance BYE winners into round 2 automatically
  const round1Completed = await prisma.tournamentMatch.findMany({
    where: { tournamentId: id, round: 1, isBye: true },
    orderBy: { matchIndex: 'asc' },
  });

  for (const match of round1Completed) {
    if (match.winnerId) {
      await advanceTournamentWinner(id, match.round, match.matchIndex, match.winnerId);
    }
  }

  // Mark tournament bracket as generated and set to ONGOING
  await prisma.tournament.update({
    where: { id },
    data: { bracketGenerated: true, status: 'ONGOING' },
  });

  const updatedTournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      matches: {
        include: { player1: true, player2: true, winner: true },
        orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
      },
      players: { orderBy: { seed: 'asc' } },
    },
  });

  return NextResponse.json({ tournament: updatedTournament });
}

/** Standard bracket seeding to ensure top seeds are on opposite sides */
function seedBracket(slots: (string | null)[]): (string | null)[] {
  const size = slots.length;
  const result: (string | null)[] = new Array(size).fill(null);
  const positions = buildPositions(size);
  for (let i = 0; i < size; i++) {
    result[positions[i]] = slots[i];
  }
  return result;
}

function buildPositions(size: number): number[] {
  if (size === 2) return [0, 1];
  const half = size / 2;
  const left = buildPositions(half);
  const right = buildPositions(half).map((p) => p + half);
  const result: number[] = [];
  for (let i = 0; i < half; i++) {
    result.push(left[i], right[half - 1 - i]);
  }
  return result;
}
