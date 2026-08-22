import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyTowerError, startTowerAttempt } from '@/lib/tower';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const attempt = await startTowerAttempt(session.user.id);
    return NextResponse.json(attempt, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyTowerError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
