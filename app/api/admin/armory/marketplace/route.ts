import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  friendlyMarketplaceError,
  getArmoryMarketplaceAdminState,
  updateArmoryMarketplaceConfig,
} from '@/lib/armory-marketplace';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  try {
    const state = await getArmoryMarketplaceAdminState({
      status: params.get('status') || undefined,
      search: params.get('search') || undefined,
      page: Number(params.get('page') || 1),
      limit: Number(params.get('limit') || 20),
    });
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

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const settings = await updateArmoryMarketplaceConfig(body);
    return NextResponse.json({ settings }, {
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
