import { DailySpinWidget } from '@/components/DailySpinWidget';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Daily Guild Spin',
  description: 'Open the vault for your daily rewards at GameZone Cafe!',
};

export default function DailySpinPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-2xl)' }}>
      <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}>
        <ArrowLeft size={16} />
        Back to Home
      </Link>
      <DailySpinWidget />
    </div>
  );
}
