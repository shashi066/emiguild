import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyWatchPartyError, getWatchPartyDetail } from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  try {
    const party = await getWatchPartyDetail(id, session?.user?.id);
    return NextResponse.json({ party }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyWatchPartyError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}
