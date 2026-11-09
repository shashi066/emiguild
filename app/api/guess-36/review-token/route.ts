import { z } from 'zod';
import { auth } from '@/auth';
import { grantGuessReviewBonus } from '@/lib/guess-36-bonuses';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requireOrigin, rewardFailure } from '@/lib/november';
const schema = z.object({ date: z.string().length(10) }).strict();
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Sign in to claim a bonus.' }, 401);
  try { requireOrigin(request); return lifecycleJson(await grantGuessReviewBonus(session.user.id, schema.parse(await request.json()).date)); }
  catch (error) { return rewardFailure(error); }
}
