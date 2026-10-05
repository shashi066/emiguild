import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { assistantConfigUpdateSchema, getAssistantConfigSummary, saveAssistantConfig } from '@/lib/assistant/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  try { return NextResponse.json(await getAssistantConfigSummary(), { headers }); }
  catch { return NextResponse.json({ error: 'AI settings could not be loaded. Save a new key to repair the configuration.' }, { status: 503, headers }); }
}
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  if (req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
  const parsed = assistantConfigUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid model ID, a daily limit from 1 to 1000, and a valid API key. Do not replace and remove a key together.' }, { status: 400, headers });
  try { return NextResponse.json(await saveAssistantConfig(parsed.data), { headers }); }
  catch { return NextResponse.json({ error: 'AI settings could not be saved. Check the database and server AUTH_SECRET configuration.' }, { status: 503, headers }); }
}
