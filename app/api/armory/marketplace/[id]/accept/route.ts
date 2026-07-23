import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  acceptArmoryTradeListing,
  friendlyMarketplaceError,
  getArmoryMarketplaceState,
} from '@/lib/armory-marketplace';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await acceptArmoryTradeListing(session.user.id, id);
    const state = await getArmoryMarketplaceState(session.user.id);
    return NextResponse.json(state, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const friendly = friendlyMarketplaceError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}
