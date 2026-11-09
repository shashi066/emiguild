import { auth } from '@/auth';
import { recoverDailySpin } from '@/lib/spin-rewards';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { publicSpinFailure, serializeSpinResult } from '@/lib/spin-public';
export async function GET(_: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Unauthorized' }, 401);
  try { return lifecycleJson(serializeSpinResult(await recoverDailySpin(session.user.id, (await params).requestId))); }
  catch (error) { return publicSpinFailure(error); }
}
