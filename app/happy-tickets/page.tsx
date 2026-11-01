import { HappyTicketPanel } from '@/components/HappyTicketPanel';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
export const metadata = { title: 'Happy Tickets — EMI Guild', description: 'Claim an available Happy Ticket for one free base PS5 gaming hour.' };
export default function HappyTicketsPage() {
  return <div className="container" style={{ maxWidth: 820, paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-2xl)' }}>
    <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}><ArrowLeft size={16} aria-hidden="true" /> Back to Home</Link>
    <HappyTicketPanel />
  </div>;
}
