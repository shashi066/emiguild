import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getEmicRewards } from '@/lib/emic-rewards';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  const rewards = await getEmicRewards(session?.user?.id);
  return NextResponse.json(rewards, { headers: { 'Cache-Control': 'no-store' } });
}
