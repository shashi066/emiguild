import { auth } from '@/auth';
import { getMineState } from '@/lib/guess-36-mines';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { rewardFailure } from '@/lib/november';
import { z } from 'zod';
const query = z.object({ inspect: z.string().min(1).max(100).optional(), recover: z.string().min(1).max(100).optional(), startRequest: z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/).optional() }).strict().refine(value => [value.inspect, value.recover, value.startRequest].filter(Boolean).length <= 1, 'Choose recovery or board inspection.');
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
 const session = await auth();
 try {
  const params = new URL(request.url).searchParams;
  if (params.getAll('inspect').length > 1 || params.getAll('recover').length > 1 || params.getAll('startRequest').length > 1) return lifecycleJson({ error: 'Choose one run.' }, 400);
  const { inspect, recover, startRequest } = query.parse(Object.fromEntries(params));
  return lifecycleJson(await getMineState(session?.user?.id ?? null, undefined, inspect, recover, startRequest));
 } catch (error) { return rewardFailure(error); }
}
