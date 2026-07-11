import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const matches = await prisma.tournamentMatch.findMany({
      where: { tournamentId: id },
      include: {
        player1: true,
        player2: true,
        winner: true,
      },
      orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
    });
    
    return NextResponse.json({ matches });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: String(error), stack: error?.stack }, { status: 500 });
  }
}
