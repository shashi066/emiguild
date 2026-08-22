import Link from 'next/link';
import { auth } from '@/auth';
import { TowerClient } from '@/components/TowerClient';
import { getTowerCurrent } from '@/lib/tower';

export const metadata = {
  title: 'Tower of Rewards',
  description: 'Use booking check-in Tower Tokens to claim rewards.',
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
            <p style={{ margin: 0, maxWidth: 280, color: 'var(--color-text-secondary)' }}>Login after your booking check-in to use your Tower Token.</p>
            <Link href="/login" className="btn btn-primary">Login</Link>
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
