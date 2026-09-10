import { AdminGuess36 } from '@/components/admin/AdminGuess36';
import { getGuess36AdminData, getGuess36Config } from '@/lib/guess-36';

export const metadata = { title: 'Guess 36 Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminGuess36Page() {
  try {
    const [config, data] = await Promise.all([
      getGuess36Config(),
      getGuess36AdminData(),
    ]);
    return <AdminGuess36 initialConfig={config} initialData={data} />;
  } catch (error) {
    console.error('Guess 36 admin page failed:', error);
    return <AdminGuess36 initialError="Guess 36 admin data could not be loaded." />;
  }
}
