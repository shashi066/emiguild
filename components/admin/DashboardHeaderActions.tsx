'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Eye, EyeOff } from 'lucide-react';

export function DashboardHeaderActions() {
  const [hideRevenue, setHideRevenue] = useState(true);

  useEffect(() => {
    const handleSync = () => {
      const isHidden = (window as any).__hideDashboardRevenue !== false;
      setHideRevenue(isHidden);
    };
    window.addEventListener('dashboard_revenue_visibility_changed', handleSync);
    handleSync();
    return () => window.removeEventListener('dashboard_revenue_visibility_changed', handleSync);
  }, []);

  const toggleHide = () => {
    const next = !hideRevenue;
    (window as any).__hideDashboardRevenue = next;
    window.dispatchEvent(new Event('dashboard_revenue_visibility_changed'));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
      <button
        type="button"
        onClick={toggleHide}
        className="btn btn-ghost"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid var(--color-border)',
          padding: '10px 14px',
          height: 42,
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-text-muted)',
          cursor: 'pointer',
        }}
        title={hideRevenue ? "Show Revenue" : "Hide Revenue"}
        id="dashboard-revenue-toggle-btn"
      >
        {hideRevenue ? <Eye size={18} /> : <EyeOff size={18} />}
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{hideRevenue ? 'Show Rev' : 'Hide Rev'}</span>
      </button>

      <Link href="/admin/bookings" className="btn btn-primary" id="admin-view-all-btn" style={{ height: 42, display: 'inline-flex', alignItems: 'center' }}>
        View All Bookings
        <ChevronRight size={16} />
      </Link>
    </div>
  );
}
