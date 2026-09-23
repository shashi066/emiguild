import Link from 'next/link';
import { auth } from '@/auth';
import { TowerClient } from '@/components/TowerClient';
import { getTowerCurrent } from '@/lib/tower';
import { GOOGLE_REVIEW_URL } from '@/lib/tower-review';

export const metadata = {
  title: 'Tower of Rewards',
  description: 'Earn Tower Tokens from booking check-ins or the daily Google review link to claim rewards.',
};

export const dynamic = 'force-dynamic';

export default async function TowerPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-2xl)' }}>
        <section style={{ minHeight: 'calc(100dvh - 150px)', display: 'grid', placeItems: 'start center' }}>
          <div className="card" style={{ width: 'min(100%, 430px)', minHeight: 320, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 12, padding: 22, textAlign: 'center' }}>
            <span className="tower-kicker">Booking Check-in Reward</span>
            <h1 style={{ margin: 0, fontSize: '1.45rem' }}>Tower of Rewards</h1>
            <p style={{ margin: 0, maxWidth: 280, color: 'var(--color-text-secondary)' }}>Login to earn your daily Tower Token or use tokens from booking check-ins.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
              <Link href="/login?callbackUrl=/tower" className="btn btn-primary">Login</Link>
              <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer" className="btn btn-success">⭐ Leave Your Guild Mark</a>
            </div>
          </div>
        </section>
      </main>
    );
  }

  try {
    const state = await getTowerCurrent(session.user.id);
    return <TowerClient initialState={JSON.parse(JSON.stringify(state))} />;
  } catch (error) {
    console.error('Tower server state failed:', error);
    return <TowerClient initialError="Tower of Rewards is taking longer than expected. Please refresh once." />;
  }
}
