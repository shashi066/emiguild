import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyTowerError, grantGoogleReviewTowerToken } from '@/lib/tower';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await grantGoogleReviewTowerToken(session.user.id);
    return NextResponse.json({ created: result.created, expiresAt: result.token.expiresAt }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const friendly = friendlyTowerError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
