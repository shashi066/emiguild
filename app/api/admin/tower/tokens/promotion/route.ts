import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  friendlyTowerError,
  getTowerPromotionPreview,
  grantPromotionalTowerTokens,
  isTowerTokenExpired,
} from '@/lib/tower';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const preview = await getTowerPromotionPreview();
    return NextResponse.json(preview, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyTowerError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
    const result = await grantPromotionalTowerTokens(requestId, session.user.id);
    return NextResponse.json({
      created: result.created,
      createdCount: result.createdCount,
      recipientCount: result.recipientCount,
      expiresAt: result.expiresAt,
      expired: isTowerTokenExpired(result.expiresAt),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyTowerError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
