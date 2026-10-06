import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canUseAssistant } from '@/lib/assistant/access';
import { getAssistantUsage } from '@/lib/assistant/usage';

export const dynamic = 'force-dynamic';
export async function GET() {
  const session = await auth();
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in to use AI chat.' }, { status: 401, headers });
  if (!await canUseAssistant(session.user)) return NextResponse.json({ error: 'Assistant is not enabled.' }, { status: 403, headers });
  try { return NextResponse.json(await getAssistantUsage(`user:${session.user.id}`), { headers }); }
  catch { return NextResponse.json({ error: 'Could not check your AI allowance. Please try again.' }, { status: 503, headers }); }
}
