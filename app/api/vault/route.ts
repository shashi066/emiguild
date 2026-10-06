import { auth } from '@/auth';
import { getVaultState } from '@/lib/lifecycle/server';
import { lifecycleJson } from '@/lib/lifecycle/http';

export const dynamic = 'force-dynamic';
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Unauthorized' }, 401);
  try {
    return lifecycleJson(await getVaultState(session.user.id));
  } catch (error) {
    console.error('Vault load failed', error);
    return lifecycleJson({ error: 'Your Vault could not be loaded. Please try again.' }, 500);
  }
}
