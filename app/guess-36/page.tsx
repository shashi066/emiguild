import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import Guess36MinesClient from '@/components/Guess36MinesClient';
import { Guess36LoadingBoundary } from '@/components/Guess36LoadingBoundary';
import { getMineState } from '@/lib/guess-36-mines';
import { skipMineEntry } from '@/lib/guess-36-client';
import styles from '@/components/guess36-mines.module.css';

export const metadata = {
  title: 'Guess 36 - Guild Expedition | EMI Guild',
  description: 'Find five treasures, avoid five traps and collect your reward. One free 90-second Guild Expedition daily.',
};

export const dynamic = 'force-dynamic';

function GameNavigation() {
  return <div className={styles.navigation}>
    <Link href="/" className="btn btn-ghost btn-sm guess-36-back"><ArrowLeft size={16} /> Back to Home</Link>
    <div id="guess36-chat-dock" className={styles.chatDock} />
  </div>;
}

export default async function Guess36Page() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  try {
    const state = await getMineState(userId);
    return (
      <Guess36LoadingBoundary skipInitial={skipMineEntry(state)}>
      <main className="guess-36-page">
        <div className="guess-36-shell">
          <GameNavigation />
          <Guess36MinesClient initialState={state} />
        </div>
      </main>
      </Guess36LoadingBoundary>
    );
  } catch (error) {
    console.error('Guess 36 page failed:', error);
    return (
      <Guess36LoadingBoundary skipInitial>
      <main className="guess-36-page">
        <div className="guess-36-shell">
          <GameNavigation />
          <Guess36MinesClient initialError="Guess 36 could not load. Please refresh once." />
        </div>
      </main>
      </Guess36LoadingBoundary>
    );
  }
}
