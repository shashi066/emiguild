import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  createWatchParty,
  friendlyWatchPartyError,
  getAdminWatchPartyState,
} from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  return session?.user?.id && session.user.role === 'ADMIN' ? session : null;
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const state = await getAdminWatchPartyState({
    skip: req.nextUrl.searchParams.get('skip'),
    take: req.nextUrl.searchParams.get('take'),
  });
  return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const party = await createWatchParty(session.user.id, body);
    return NextResponse.json({ party }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyWatchPartyError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}
