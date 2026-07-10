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
      <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: '1.5rem', fontSize: '0.9rem', transition: 'color 0.2s ease' }}>
        <ArrowLeft size={16} /> Back to Home
      </Link>
      <DailySpinWidget />
    </div>
  );
}
