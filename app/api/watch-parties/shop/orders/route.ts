import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyWatchPartyError, purchaseWatchPartyShopOrder } from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const shop = await purchaseWatchPartyShopOrder(session.user.id, body.itemKey);
    return NextResponse.json(shop, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyWatchPartyError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}
