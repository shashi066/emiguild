import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyTowerError, grantTowerToken, isTowerTokenExpired } from '@/lib/tower';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const checkInId = typeof body?.checkInId === 'string' ? body.checkInId.trim() : '';
    const result = await grantTowerToken(checkInId, {
      id: session.user.id,
      role: session.user.role,
    });
    return NextResponse.json({
      token: {
        expiresAt: result.token.expiresAt,
        expired: isTowerTokenExpired(result.token.expiresAt),
      },
      created: result.created,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyTowerError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
