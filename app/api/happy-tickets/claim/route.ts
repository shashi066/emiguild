import { auth } from '@/auth';
import { z } from 'zod';
import { claimHappyTicket } from '@/lib/happy-tickets';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requestIdSchema, requireOrigin, rewardFailure } from '@/lib/november';
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Unauthorized' }, 401);
  try {
    requireOrigin(request);
    const { requestId } = z.object({ requestId: requestIdSchema }).strict().parse(await request.json());
    return lifecycleJson(await claimHappyTicket(session.user.id, requestId));
  } catch (error) { return rewardFailure(error); }
}
