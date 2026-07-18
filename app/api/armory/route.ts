import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getArmoryState, serializeArmoryState } from '@/lib/armory';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const state = await getArmoryState(session.user.id);
    return NextResponse.json(serializeArmoryState(state), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Artifacts state load failed:', error);
    return NextResponse.json({ error: 'Failed to load Artifacts.' }, { status: 500 });
  }
}
