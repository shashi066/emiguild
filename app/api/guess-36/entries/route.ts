import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { createGuess36Entry, friendlyGuess36Error } from '@/lib/guess-36';
import { parseGuess36Selection } from '@/lib/guess-36-rules';

const entrySchema = z.object({
  roundDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  selection: z.unknown().transform(parseGuess36Selection).refine((value) => value !== null),
}).strict();

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const parsed = entrySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Choose exactly one number from 1-36, Even, Odd, or a range.' }, { status: 400 });
    }
    const entry = await createGuess36Entry(session.user.id, parsed.data);
    return NextResponse.json({ success: true, entry }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyGuess36Error(error);
    return NextResponse.json({
      error: friendly.error,
      code: friendly.code,
      ...(friendly.existingEntry ? { entered: true, entry: friendly.existingEntry } : {}),
    }, { status: friendly.status });
  }
}
