import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getWatchPartyList } from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  const state = await getWatchPartyList(session?.user?.id);
  return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
}
