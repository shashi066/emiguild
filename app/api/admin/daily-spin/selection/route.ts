import { auth } from '@/auth';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requireCurrentUser, requireOrigin, rewardFailure } from '@/lib/november';
import { configureSpinSelection, readSpinSelection, spinSelectionInput } from '@/lib/spin-selection';

export const dynamic = 'force-dynamic';
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
  try { await requireCurrentUser(session.user.id, undefined, true); return lifecycleJson(await readSpinSelection()); }
  catch (error) { return rewardFailure(error); }
}
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
  try { requireOrigin(request); return lifecycleJson(await configureSpinSelection(session.user.id, spinSelectionInput.parse(await request.json()))); }
  catch (error) { return rewardFailure(error); }
}
