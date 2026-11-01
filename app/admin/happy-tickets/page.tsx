import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getAdminHappyTicketsReport } from '@/lib/admin-happy-tickets';
import { RewardError } from '@/lib/november';
import { AdminHappyTickets } from '@/components/admin/AdminHappyTickets';
export default async function HappyTicketsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  let initialData;
  try { initialData = await getAdminHappyTicketsReport(session.user.id); } catch (error) {
    if (error instanceof RewardError && error.status === 403) redirect('/');
    return <AdminHappyTickets initialOwnerId={session.user.id} initialError="Could not load tickets. Try again." />;
  }
  return <AdminHappyTickets initialData={JSON.parse(JSON.stringify(initialData))} initialOwnerId={session.user.id} />;
}
