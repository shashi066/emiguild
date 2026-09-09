import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import { EmicRewardsClient } from '@/components/EmicRewardsClient';
import { getEmicRewards } from '@/lib/emic-rewards';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'EMIC Rewards', description: 'Redeem EMIC for EmiGuild rewards.' };

export default async function RewardsPage() {
  const session = await auth();
  const state = await getEmicRewards(session?.user?.id);
  return (
    <main className="page-wrapper">
      <div className="container">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}><ArrowLeft size={16} />Back to Home</Link>
        <EmicRewardsClient initialState={JSON.parse(JSON.stringify(state))} signedIn={Boolean(session?.user?.id)} />
      </div>
    </main>
  );
}
