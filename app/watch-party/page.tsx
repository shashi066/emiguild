import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import { WatchPartyClient } from '@/components/WatchPartyClient';
import { getWatchPartyList } from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Watch Party',
  description: 'Premier League watch parties at EmiGuild.',
};

export default async function WatchPartyPage() {
  const session = await auth();
  const initialState = await getWatchPartyList(session?.user?.id);

  return (
    <div className="page-wrapper">
      <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-2xl)' }}>
        <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}>
          <ArrowLeft size={16} />
          Back to Home
        </Link>
        <WatchPartyClient
          initialState={JSON.parse(JSON.stringify(initialState))}
          signedIn={Boolean(session?.user?.id)}
        />
      </div>
    </div>
  );
}
