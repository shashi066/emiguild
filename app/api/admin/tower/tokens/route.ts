import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyTowerError, grantManualTowerTokens, isTowerTokenExpired } from '@/lib/tower';

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
    const quantity = body?.quantity === undefined ? 1 : Number(body.quantity);
    const result = await grantManualTowerTokens(userId, requestId, quantity, session.user.id);
    const expiresAt = result.tokens[0].expiresAt;
    return NextResponse.json({
      created: result.created,
      createdCount: result.createdCount,
      quantity: result.tokens.length,
      expiresAt,
      expired: isTowerTokenExpired(expiresAt),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyTowerError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
