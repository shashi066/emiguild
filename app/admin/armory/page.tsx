import { AdminArmory } from '@/components/admin/AdminArmory';
import { getArmoryAdminConfig } from '@/lib/armory';

export const metadata = { title: 'Artifacts Admin' };

export default async function AdminArmoryPage() {
  try {
    const initialConfig = await getArmoryAdminConfig();
    return <AdminArmory initialConfig={JSON.parse(JSON.stringify(initialConfig))} />;
  } catch (error) {
    console.error('Artifacts admin server config failed:', error);
    return <AdminArmory initialError="Artifacts needs a dev server restart after Prisma generation." />;
  }
}
