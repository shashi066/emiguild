import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canUseAssistant } from '@/lib/assistant/access';
import { guidedStateSchema } from '@/lib/assistant/flow-state';
import { getGuidedView } from '@/lib/assistant/guided';
import { ASSISTANT_VISITOR_COOKIE, assistantActor, startGuidedRequest, recordAssistantUsage } from '@/lib/assistant/usage';

export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const session = await auth();
  if (!await canUseAssistant(session?.user)) return NextResponse.json({ error: 'Assistant is not enabled.' }, { status: 403 });
  const parsed = guidedStateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Please check your selections.' }, { status: 400 });
  const visitor = req.cookies.get(ASSISTANT_VISITOR_COOKIE)?.value || crypto.randomUUID();
  const actor = assistantActor(session?.user?.id ?? null, visitor);
  const json = (data: unknown, status = 200) => {
    const response = NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(ASSISTANT_VISITOR_COOKIE, visitor, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 7776000 });
    return response;
  };
  try {
    if (!await startGuidedRequest(actor.actorKey)) return json({ error: 'Too many selections. Please try again in a minute.' }, 429);
    const view = await getGuidedView(parsed.data, { user: session?.user?.id ? { id: session.user.id } : null, requestUrl: req.url, cookieHeader: req.headers.get('cookie') ?? '' });
    await recordAssistantUsage(actor.actorKey, { toolCallCount: 1, preparedActions: view.card?.actionToken ? 1 : 0 });
    return json(view);
  } catch (error) {
    await recordAssistantUsage(actor.actorKey, { errorCount: 1 }).catch(() => undefined);
    return json({ error: error instanceof Error && !error.message.includes('prisma') ? error.message : 'Unable to load options. Please retry.' }, 400);
  }
}
