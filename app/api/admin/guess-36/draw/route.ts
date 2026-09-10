import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { drawGuess36Round, friendlyGuess36Error } from '@/lib/guess-36';

const drawSchema = z.object({ roundDate: z.string().trim() }).strict();

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const parsed = drawSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Choose a valid round date.' }, { status: 400 });
    const result = await drawGuess36Round(parsed.data.roundDate);
    return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyGuess36Error(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
