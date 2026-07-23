import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  createArmoryTradeListing,
  friendlyMarketplaceError,
  getArmoryMarketplaceState,
} from '@/lib/armory-marketplace';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (
      typeof body.offeredArtifactId !== 'string'
      || typeof body.requestedArtifactId !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Choose both artifacts.', code: 'ARTIFACTS_REQUIRED' },
        { status: 400 },
      );
    }

    await createArmoryTradeListing(
      session.user.id,
      body.offeredArtifactId,
      body.requestedArtifactId,
    );
    const state = await getArmoryMarketplaceState(session.user.id);
    return NextResponse.json(state, {
      status: 201,
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
