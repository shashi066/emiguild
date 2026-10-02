import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { VaultClient } from '@/components/lifecycle/VaultClient';
export const metadata = { title: 'Your Vault' };
export default async function VaultPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?callbackUrl=/vault');
  return <VaultClient />;
}
