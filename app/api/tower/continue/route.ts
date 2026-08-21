import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { continueTowerAttempt, friendlyTowerError } from '@/lib/tower';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const attemptId = typeof body?.attemptId === 'string' ? body.attemptId.trim() : '';
    const level = Number(body?.level);
    const attempt = await continueTowerAttempt(session.user.id, attemptId, level);
    return NextResponse.json({ attempt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyTowerError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
