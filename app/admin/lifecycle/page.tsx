import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { MessagingClient } from '@/components/lifecycle/MessagingClient';
export default async function LifecyclePage() {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') redirect('/');
  return <MessagingClient />;
}
