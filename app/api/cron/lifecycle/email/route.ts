import { timingSafeEqual } from 'node:crypto';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { runLifecycleEmails } from '@/lib/lifecycle/delivery';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret ?? ''}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return lifecycleJson({ error: 'Unauthorized' }, 401);
  }
  try { return lifecycleJson(await runLifecycleEmails()); }
  catch { return lifecycleJson({ error: 'Email run failed. Check delivery history before retrying.' }, 500); }
}
