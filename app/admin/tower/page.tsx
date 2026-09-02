import { AdminTower } from '@/components/admin/AdminTower';
import { DEFAULT_TOWER_REWARDS, getTowerAdminHistory, getTowerConfig, getTowerTokenExpiry } from '@/lib/tower';
import { DEFAULT_TOWER_RUN_DURATION_SECONDS } from '@/lib/tower-clock';

export const metadata = { title: 'Tower Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminTowerPage() {
  try {
    const now = new Date();
    const [config, history] = await Promise.all([getTowerConfig(), getTowerAdminHistory({ now })]);
    return <AdminTower initialConfig={JSON.parse(JSON.stringify(config))} initialHistory={JSON.parse(JSON.stringify(history))} manualGrantExpiresAt={getTowerTokenExpiry(now).toISOString()} />;
  } catch (error) {
    console.error('Tower admin initial state failed:', error);
    return <AdminTower initialConfig={{ enabled: true, rewards: DEFAULT_TOWER_REWARDS, runDurationSeconds: DEFAULT_TOWER_RUN_DURATION_SECONDS }} manualGrantExpiresAt={getTowerTokenExpiry().toISOString()} initialError="Tower admin data could not be loaded." />;
  }
}
