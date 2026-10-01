import { lifecycleJson } from '@/lib/lifecycle/http';
import { lifecycleUnsubscribeSecret, verifyUnsubscribe } from '@/lib/lifecycle/email';
import { unsubscribeEmail } from '@/lib/lifecycle/unsubscribe';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const identity = verifyUnsubscribe(new URL(request.url).searchParams.get('token') ?? '', lifecycleUnsubscribeSecret());
  return lifecycleJson({ valid: !!identity, message: 'Confirm on the unsubscribe page to stop lifecycle emails.' }, identity ? 200 : 400);
}
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const identity = verifyUnsubscribe(token, lifecycleUnsubscribeSecret());
  if (!identity || !await unsubscribeEmail(identity)) return lifecycleJson({ error: 'This link is invalid or belongs to an earlier email address.' }, 400);
  if (request.headers.get('accept')?.includes('text/html')) return Response.redirect(new URL('/email/unsubscribe?done=1', request.url), 303);
  return lifecycleJson({ success: true, message: 'Lifecycle emails stopped.' });
}
