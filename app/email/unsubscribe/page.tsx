import Link from 'next/link';
import { lifecycleUnsubscribeSecret, verifyUnsubscribe } from '@/lib/lifecycle/email';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stop email updates', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const params = await searchParams;
  const valid = verifyUnsubscribe(params.token ?? '', lifecycleUnsubscribeSecret());
  return <div className="page-wrapper"><div className="container-sm"><div className="card" style={{ padding: 'var(--space-xl)' }}>
    <h1 className="page-title">{params.done === '1' ? 'Email updates stopped' : 'Stop EmiGuild email updates'}</h1>
    <p style={{ margin: 'var(--space-lg) 0' }}>{params.done === '1' ? 'You will no longer receive lifecycle emails. Booking and account-security emails continue as usual.' : valid ? 'Confirm below to stop game reminders and weekly Vault emails.' : 'This unsubscribe link is invalid. Contact EmiGuild to stop updates.'}</p>
    {valid && params.done !== '1' && <form method="post" action={'/api/lifecycle/unsubscribe?token=' + encodeURIComponent(params.token!)}><button className="btn btn-primary">Stop email updates</button></form>}
    <Link href="/" className="btn btn-ghost" style={{ marginTop: 'var(--space-md)' }}>Back to Home</Link>
  </div></div></div>;
}
