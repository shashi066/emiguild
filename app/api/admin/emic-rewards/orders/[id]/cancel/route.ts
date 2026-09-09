import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { cancelEmicRewardOrder, friendlyEmicRewardsError } from '@/lib/emic-rewards';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const { id } = await params;
    return NextResponse.json({ order: await cancelEmicRewardOrder(session.user.id, id) });
  } catch (error) {
    const friendly = friendlyEmicRewardsError(error);
    return NextResponse.json({ error: friendly.error, code: friendly.code }, { status: friendly.status });
  }
}
