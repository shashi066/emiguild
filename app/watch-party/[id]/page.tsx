import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { WatchPartyDetailClient } from '@/components/WatchPartyDetailClient';
import { getWatchPartyDetail, WatchPartyError } from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

export default async function WatchPartyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  try {
    const party = await getWatchPartyDetail(id, session?.user?.id);
    return (
      <div className="page-wrapper">
        <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-2xl)' }}>
          <WatchPartyDetailClient
            initialParty={JSON.parse(JSON.stringify(party))}
            signedIn={Boolean(session?.user?.id)}
          />
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof WatchPartyError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
