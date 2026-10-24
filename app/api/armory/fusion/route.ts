import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fuseArtifacts, getFusionReceipt } from '@/lib/armory-fusion';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('requestId');
  if (!id || !/^[a-zA-Z0-9-]{16,80}$/.test(id)) return NextResponse.json({ error: 'Invalid request ID.' }, { status: 400 });
  try { return NextResponse.json({ receipt: await getFusionReceipt(session.user.id, id) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Could not check fusion. Retry safely.' }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json(await fuseArtifacts(session.user.id, await req.json())); }
  catch (error) {
    const code = error instanceof Error ? error.message : '';
    const messages: Record<string, string> = {
      INVALID_FUSION: 'Select exactly three available items of the same tier.',
      CHOOSE_PLATINUM: 'Choose an active Platinum piece.',
      FUSION_DISABLED: 'Lucky Fusion is currently disabled.',
      FUSION_POOL_UNAVAILABLE: 'This fusion tier is temporarily unavailable.',
      FUSION_REQUEST_CONFLICT: 'This request ID already belongs to another fusion.',
      FUSION_INVENTORY_CHANGED: 'Your inventory changed. Refresh and select available items.',
    };
    if (messages[code]) return NextResponse.json({ error: messages[code], definitive: true }, { status: code.includes('CONFLICT') || code.includes('CHANGED') ? 409 : 400 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON.', definitive: true }, { status: 400 });
    console.error('Armory fusion failed', { userId: session.user.id, code });
    return NextResponse.json({ error: 'Could not confirm fusion. Retry to recover the same result.' }, { status: 503 });
  }
}
