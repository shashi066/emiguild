import { ArmoryClient } from '@/components/ArmoryClient';
import { auth } from '@/auth';
import { getArmoryState, serializeArmoryState } from '@/lib/armory';

export const metadata = {
  title: 'Artifacts',
  description: 'Forge artifacts, complete equipment sets, and unlock reward tickets.',
};

export const dynamic = 'force-dynamic';

export default async function ArmoryPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return <ArmoryClient />;
  }

  try {
    const initialState = await getArmoryState(session.user.id);
    return <ArmoryClient initialState={JSON.parse(JSON.stringify(serializeArmoryState(initialState)))} />;
  } catch (error) {
    console.error('Artifacts server state failed:', error);
    return <ArmoryClient initialError="Artifacts are taking longer than expected. Please refresh once." />;
  }
}
