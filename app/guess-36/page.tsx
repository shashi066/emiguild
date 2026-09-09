import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import { Guess36Client } from '@/components/Guess36Client';
import { getGuess36Current } from '@/lib/guess-36';

export const metadata = {
  title: 'Guess 36 | EMI Guild',
  description: 'Play Guess 36 at EMI Guild. Make one prediction every day and check the result at midnight.',
};

export const dynamic = 'force-dynamic';

export default async function Guess36Page() {
  const session = await auth();
  const viewer = session?.user?.id ? { id: session.user.id, role: session.user.role } : null;

  try {
    const state = await getGuess36Current(viewer);
    return (
      <main className="guess-36-page">
        <div className="guess-36-shell">
          <Link href="/" className="btn btn-ghost btn-sm guess-36-back"><ArrowLeft size={16} /> Back to Home</Link>
          <Guess36Client initialState={state} />
        </div>
      </main>
    );
  } catch (error) {
    console.error('Guess 36 page failed:', error);
    return (
      <main className="guess-36-page">
        <div className="guess-36-shell">
          <Link href="/" className="btn btn-ghost btn-sm guess-36-back"><ArrowLeft size={16} /> Back to Home</Link>
          <Guess36Client initialError="Guess 36 could not load. Please refresh once." />
        </div>
      </main>
    );
  }
}
