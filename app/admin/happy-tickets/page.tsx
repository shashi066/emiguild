import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { requireCurrentUser } from '@/lib/november';
import { AdminHappyTickets } from '@/components/admin/AdminHappyTickets';
export default async function HappyTicketsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  try { await requireCurrentUser(session.user.id, undefined, true); } catch { redirect('/'); }
  return <AdminHappyTickets />;
}
