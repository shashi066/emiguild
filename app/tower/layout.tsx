import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TowerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: 'calc(100dvh - 72px)', background: '#080d16' }}>
      <div className="tower-route-back" style={{ height: 52, display: 'flex', alignItems: 'center', padding: '8px 10px' }}>
        <div style={{ width: 'min(100%, 480px)', margin: '0 auto' }}>
          <Link href="/" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /> Back to Home</Link>
        </div>
      </div>
      {children}
    </div>
  );
}
