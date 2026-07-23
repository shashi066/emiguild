import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  adjustArmoryGuildGems,
  friendlyMarketplaceError,
  getArmoryMarketplaceGemAccount,
  searchArmoryMarketplaceGemUsers,
} from '@/lib/armory-marketplace';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get('userId')?.trim();
  const search = req.nextUrl.searchParams.get('search') || '';
  try {
    if (userId) {
      const account = await getArmoryMarketplaceGemAccount(userId);
      return NextResponse.json({ account }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const users = await searchArmoryMarketplaceGemUsers(search);
    return NextResponse.json({ users }, {
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
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (typeof body.userId !== 'string') {
      return NextResponse.json(
        { error: 'Choose a user.', code: 'USER_REQUIRED' },
        { status: 400 },
      );
    }
    const account = await adjustArmoryGuildGems(
      session.user.id,
      body.userId,
      body.amount,
      body.note,
    );
    return NextResponse.json({ account }, {
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
