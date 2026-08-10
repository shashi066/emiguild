import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyWatchPartyError, getAdminWatchPartyShopOrders } from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const orders = await getAdminWatchPartyShopOrders({
      skip: req.nextUrl.searchParams.get('skip'),
      take: req.nextUrl.searchParams.get('take'),
    });
    return NextResponse.json(orders, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[/api/admin/watch-parties/orders] failed:', error);
    const friendly = friendlyWatchPartyError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}
