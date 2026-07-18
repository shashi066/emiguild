import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyArmoryError, getArmoryAdminConfig, serializeArmoryAdminConfig, updateArmoryAdminConfig } from '@/lib/armory';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const config = await getArmoryAdminConfig();
    return NextResponse.json(serializeArmoryAdminConfig(config), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Artifacts config load failed:', error);
    return NextResponse.json({ error: 'Failed to load Artifacts config.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const config = await updateArmoryAdminConfig(body);
    return NextResponse.json(serializeArmoryAdminConfig(config), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyArmoryError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
