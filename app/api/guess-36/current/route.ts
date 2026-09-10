import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyGuess36Error, getGuess36Current } from '@/lib/guess-36';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  const viewer = session?.user?.id
    ? { id: session.user.id, role: session.user.role }
    : null;
  try {
    const state = await getGuess36Current(viewer);
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Guess 36 current state failed:', error);
    const friendly = friendlyGuess36Error(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
