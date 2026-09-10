import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyEmicRewardsError, purchaseEmicReward } from '@/lib/emic-rewards';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });

  try {
    const body = await request.json();
    const rewards = await purchaseEmicReward(session.user.id, body.itemKey);
    return NextResponse.json(rewards, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyEmicRewardsError(error);
    return NextResponse.json({ error: friendly.error, code: friendly.code }, { status: friendly.status });
  }
}
