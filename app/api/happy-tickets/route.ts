import { auth } from '@/auth';
import { happyPoolState, happyWallet } from '@/lib/happy-tickets';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { rewardFailure } from '@/lib/november';
export async function GET() {
  try {
    const session = await auth();
    const now = new Date();
    const [pool, wallet] = await Promise.all([happyPoolState(session?.user?.id, now), session?.user?.id ? happyWallet(session.user.id, now) : Promise.resolve(null)]);
    return lifecycleJson({ pool, wallet });
  } catch (error) { return rewardFailure(error); }
}
