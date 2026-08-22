import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyTowerError, pickTowerCard } from '@/lib/tower';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const attemptId = typeof body?.attemptId === 'string' ? body.attemptId.trim() : '';
    const cardId = typeof body?.cardId === 'string' ? body.cardId.trim() : '';
    const result = await pickTowerCard(session.user.id, attemptId, cardId);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyTowerError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
