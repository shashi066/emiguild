import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyWatchPartyError, submitWatchPartyPrediction } from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  try {
    const body = await req.json();
    const party = await submitWatchPartyPrediction(
      session.user.id,
      id,
      body.optionKey,
      body.stakeCoins,
    );
    return NextResponse.json({ party }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyWatchPartyError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}
