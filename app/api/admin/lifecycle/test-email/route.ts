import { auth } from '@/auth';
import { isSameOrigin, lifecycleJson } from '@/lib/lifecycle/http';
import { sendAdminTest } from '@/lib/lifecycle/delivery';
export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN' || !isSameOrigin(request)) return lifecycleJson({ error: 'Forbidden' }, 403);
  try {
    const result = await sendAdminTest(session.user.id);
    if (result.status === 'DISABLED') return lifecycleJson({ error: 'Lifecycle email delivery requires the existing Gmail credentials and AUTH_SECRET in production.' }, 503);
    if (result.status === 'LIMIT_REACHED') return lifecycleJson({ error: 'The daily email test or send limit was reached.' }, 429);
    return lifecycleJson(result, result.status === 'ACCEPTED' ? 200 : 502);
  } catch { return lifecycleJson({ error: 'The email test failed. Check delivery history before retrying.' }, 500); }
}
