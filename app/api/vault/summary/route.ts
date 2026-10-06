import { auth } from '@/auth';
import { getVaultSummary } from '@/lib/lifecycle/summary';
import { lifecycleJson } from '@/lib/lifecycle/http';

export const dynamic = 'force-dynamic';
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Unauthorized' }, 401);
  try { return lifecycleJson(await getVaultSummary(session.user.id)); }
  catch { return lifecycleJson({ error: 'Vault summary unavailable' }, 503); }
}
