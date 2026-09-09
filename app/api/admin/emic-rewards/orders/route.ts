import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyEmicRewardsError, getAdminEmicRewardOrders } from '@/lib/emic-rewards';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const result = await getAdminEmicRewardOrders({
      skip: request.nextUrl.searchParams.get('skip'),
      take: request.nextUrl.searchParams.get('take'),
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyEmicRewardsError(error);
    return NextResponse.json({ error: friendly.error, code: friendly.code }, { status: friendly.status });
  }
}
