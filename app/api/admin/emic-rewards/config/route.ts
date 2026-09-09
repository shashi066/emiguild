import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  friendlyEmicRewardsError,
  getAdminEmicRewardsConfig,
  updateAdminEmicRewardsConfig,
} from '@/lib/emic-rewards';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  return session?.user?.role === 'ADMIN';
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    return NextResponse.json(await getAdminEmicRewardsConfig(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyEmicRewardsError(error);
    return NextResponse.json({ error: friendly.error, code: friendly.code }, { status: friendly.status });
  }
}

export async function PUT(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = await request.json();
    return NextResponse.json(await updateAdminEmicRewardsConfig(body), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyEmicRewardsError(error);
    return NextResponse.json({ error: friendly.error, code: friendly.code }, { status: friendly.status });
  }
}
