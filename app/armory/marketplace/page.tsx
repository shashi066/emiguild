import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ArmoryMarketplaceClient } from '@/components/ArmoryMarketplaceClient';
import { getArmoryMarketplaceState } from '@/lib/armory-marketplace';

export const metadata: Metadata = {
  title: 'Artifact Exchange | EmiGuild',
  description: 'Trade one EmiGuild artifact for another using Guild Gems.',
};

export const dynamic = 'force-dynamic';

export default async function ArmoryMarketplacePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/armory/marketplace');
  }

  try {
    const state = await getArmoryMarketplaceState(session.user.id);
    return <ArmoryMarketplaceClient initialState={state} />;
  } catch (error) {
    console.error('Artifact Exchange server state failed:', error);
    return (
      <ArmoryMarketplaceClient
        initialState={null}
        initialError="The Artifact Exchange could not load. Refresh once."
      />
    );
  }
}
