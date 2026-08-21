import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  friendlyTowerError,
  getTowerConfig,
  updateTowerAdminConfig,
} from '@/lib/tower';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const config = await getTowerConfig();
    return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyTowerError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const config = await updateTowerAdminConfig(body);
    return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyTowerError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
