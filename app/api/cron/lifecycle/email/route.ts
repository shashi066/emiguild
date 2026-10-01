import { lifecycleJson } from '@/lib/lifecycle/http';
import { runLifecycleEmails } from '@/lib/lifecycle/delivery';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET() {
  try { return lifecycleJson(await runLifecycleEmails()); }
  catch { return lifecycleJson({ error: 'Lifecycle email run failed. Check delivery history before retrying.' }, 500); }
}
