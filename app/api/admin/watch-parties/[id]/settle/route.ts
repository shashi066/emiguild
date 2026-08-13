import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyWatchPartyError, settleWatchParty, voidWatchParty } from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;

  try {
    const body = await req.json();
    const party = body.action === 'VOID'
      ? await voidWatchParty(session.user.id, id)
      : await settleWatchParty(session.user.id, id, body.optionKey);
    return NextResponse.json({ party }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyWatchPartyError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}
