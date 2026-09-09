import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function RewardsLoading() {
  return (
    <main className="page-wrapper">
      <div className="container">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}><ArrowLeft size={16} />Back to Home</Link>
        <div className="loading-state" role="status"><span className="spinner" />Loading EMIC Rewards...</div>
      </div>
    </main>
  );
}
