import { auth } from '@/auth';
import { happyPoolState } from '@/lib/happy-tickets';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { rewardFailure } from '@/lib/november';
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return lifecycleJson({ capacity: 5 });
    const pool = await happyPoolState(session.user.id);
    return lifecycleJson({ available: pool.available, capacity: 5 });
  } catch (error) { return rewardFailure(error); }
}
