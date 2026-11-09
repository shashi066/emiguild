import { getMineEligibility } from '@/lib/guess-36-bonuses';
import { z } from 'zod';
import { auth } from '@/auth';
import { collectMine } from '@/lib/guess-36-mines';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requireOrigin, rewardFailure } from '@/lib/november';
import type { MineActionResponse } from '@/lib/guess-36-mines-rules';
const schema = z.object({ runId: z.string().min(1).max(100), version: z.number().int().min(0) }).strict();
export async function POST(request: Request) {
 const session = await auth();
 if (!session?.user?.id) return lifecycleJson({ error: 'Sign in to play.' }, 401);
 try { requireOrigin(request); const run = await collectMine(session.user.id, schema.parse(await request.json())); return lifecycleJson({ run, serverNow: new Date().toISOString(), eligibility: await getMineEligibility(session.user.id) } satisfies MineActionResponse); }
 catch (error) { return rewardFailure(error); }
}
