import { getMineEligibility } from '@/lib/guess-36-bonuses';
import { z } from 'zod';
import { auth } from '@/auth';
import { revealMine } from '@/lib/guess-36-mines';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requireOrigin, rewardFailure } from '@/lib/november';
import type { MineActionResponse } from '@/lib/guess-36-mines-rules';
const schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), index: z.number().int().min(0).max(35), runId: z.string().min(1).max(100).optional(), version: z.number().int().min(0).optional(), requestId: z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/).optional() }).strict().refine(v => !v.runId || v.version !== undefined);
export async function POST(request: Request) {
 const session = await auth();
 if (!session?.user?.id) return lifecycleJson({ error: 'Sign in to play.' }, 401);
 try { requireOrigin(request); const run = await revealMine(session.user.id, schema.parse(await request.json())); return lifecycleJson({ run, serverNow: new Date().toISOString(), eligibility: await getMineEligibility(session.user.id) } satisfies MineActionResponse); }
 catch (error) { return rewardFailure(error); }
}
