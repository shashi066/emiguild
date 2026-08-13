import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getWatchPartyShop } from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const shop = await getWatchPartyShop(session.user.id);
  return NextResponse.json(shop, { headers: { 'Cache-Control': 'no-store' } });
}
