import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyTowerError, grantManualTowerToken } from '@/lib/tower';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
    const result = await grantManualTowerToken(userId, requestId, session.user.id);
    return NextResponse.json({
      created: result.created,
      token: {
        expiresAt: result.token.expiresAt,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyTowerError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
