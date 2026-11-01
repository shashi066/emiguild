import { auth } from '@/auth';
import { z } from 'zod';
import { activateBankedReset } from '@/lib/guild-resets';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requestIdSchema, requireOrigin, rewardFailure } from '@/lib/november';
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Unauthorized' }, 401);
  try {
    requireOrigin(request);
    const input = z.object({ requestId: requestIdSchema, resetId: z.string().min(1), version: z.number().int().min(0) }).strict().parse(await request.json());
    return lifecycleJson(await activateBankedReset(session.user.id, input));
  } catch (error) { return rewardFailure(error); }
}
