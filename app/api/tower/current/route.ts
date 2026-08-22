import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyTowerError, getTowerCurrent } from '@/lib/tower';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const recoveryAttemptId = req.nextUrl.searchParams.get('attemptId')?.trim().slice(0, 100) || undefined;
    const state = await getTowerCurrent(session.user.id, new Date(), { recoveryAttemptId });
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyTowerError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
