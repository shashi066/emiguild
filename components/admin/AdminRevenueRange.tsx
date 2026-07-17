'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

type Props = {
  initialFrom: string;
  initialTo: string;
  initialRevenue: number;
  initialBookingCount: number;
};

export function AdminRevenueRange({
  initialFrom,
  initialTo,
  initialRevenue,
  initialBookingCount,
}: Props) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [revenue, setRevenue] = useState(initialRevenue);
  const [bookingCount, setBookingCount] = useState(initialBookingCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const rangeLabel = useMemo(() => {
    if (from === initialFrom && to === initialTo) return 'This month';
    return 'Selected days';
  }, [from, initialFrom, initialTo, to]);

  useEffect(() => {
    if (!from || !to || from > to) {
      setError('Choose a valid date range.');
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({ from, to });
        const res = await fetch(`/api/admin/revenue-range?${params}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load revenue.');
        setRevenue(data.revenue ?? 0);
        setBookingCount(data.bookingCount ?? 0);
      } catch (err: any) {
        if (err.name !== 'AbortError') setError(err.message || 'Could not load revenue.');
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [from, to]);

  return (
    <div className="booking-detail-item" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div className="booking-detail-label">{rangeLabel} Revenue</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00d4ff', fontFamily: 'Orbitron, sans-serif' }}>
            {loading ? '...' : formatCurrency(revenue)}
          </div>
        </div>
        <CalendarDays size={20} color="#00d4ff" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input
          type="date"
          className="form-input"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          aria-label="Revenue start date"
          style={{ minWidth: 0, padding: '8px 10px', fontSize: '0.82rem' }}
        />
        <input
          type="date"
          className="form-input"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          aria-label="Revenue end date"
          style={{ minWidth: 0, padding: '8px 10px', fontSize: '0.82rem' }}
        />
      </div>

      <div style={{ fontSize: '0.75rem', color: error ? '#ff8a8a' : 'var(--color-text-muted)' }}>
        {error || `${bookingCount} booking${bookingCount === 1 ? '' : 's'} counted`}
      </div>
    </div>
  );
}
