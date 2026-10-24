import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { GuildSpinLoadingBoundary } from '@/components/GuildSpinLoadingBoundary';

export default function DailySpinLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-2xl)' }}>
      <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}>
        <ArrowLeft size={16} />
        Back to Home
      </Link>
      <GuildSpinLoadingBoundary>{children}</GuildSpinLoadingBoundary>
    </div>
  );
}
