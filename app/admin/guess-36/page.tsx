import { auth } from '@/auth';
import { requireCurrentUser } from '@/lib/november';
import { getMineAdmin } from '@/lib/guess-36-mines';
import { AdminGuess36Mines } from '@/components/admin/AdminGuess36Mines';
export const metadata = { title: 'Guess 36 Admin' };
export const dynamic = 'force-dynamic';
export default async function AdminGuess36Page() {
 const session = await auth();
 if (!session?.user?.id) return <p>Forbidden</p>;
 await requireCurrentUser(session.user.id, undefined, true);
 return <AdminGuess36Mines initialData={await getMineAdmin()} />;
}
