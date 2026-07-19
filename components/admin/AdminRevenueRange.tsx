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
    <section className="admin-revenue-range" aria-label="Dashboard revenue range">
      <div className="admin-revenue-range-heading">
        <span className="admin-revenue-range-icon">
          <CalendarDays size={20} />
        </span>
        <div>
          <div className="admin-revenue-range-title">Revenue period</div>
          <div className="admin-revenue-range-copy">Choose the booking dates included in the revenue total.</div>
        </div>
      </div>

      <div className="admin-revenue-range-fields">
        <label>
          <span>From</span>
          <input
            type="date"
            className="form-input"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            aria-label="Revenue start date"
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="date"
            className="form-input"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-label="Revenue end date"
          />
        </label>
      </div>

      <div className="admin-revenue-range-result" aria-live="polite">
        <div className="admin-revenue-range-label">{rangeLabel} revenue</div>
        <div className="admin-revenue-range-value">{loading ? '...' : formatCurrency(revenue)}</div>
        <div className={error ? 'admin-revenue-range-error' : 'admin-revenue-range-count'}>
          {error || `${bookingCount} booking${bookingCount === 1 ? '' : 's'} counted`}
        </div>
      </div>
    </section>
  );
}
