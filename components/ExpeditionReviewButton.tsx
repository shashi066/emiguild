'use client';
import { useEffect, useRef, useState } from 'react';
import { GOOGLE_REVIEW_URL } from '@/lib/tower-review';
import type { ExpeditionEligibility } from '@/lib/guess-36-bonuses';
import styles from './expedition-review.module.css';

export function ExpeditionReviewButton({ review, recoveryKey, disabled, onGranted }: {
  review: ExpeditionEligibility['review']; recoveryKey: string | null; disabled?: boolean; onGranted: () => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [claimed, setClaimed] = useState('');
  const flight = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const claim = async () => {
    if (flight.current || disabled || !recoveryKey) return;
    flight.current = true; setBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 20_000);
    const key = `emiguild:guess36:${recoveryKey}:review`;
    try {
      const date = localStorage.getItem(key) ?? review.date;
      localStorage.setItem(key, date);
      const response = await fetch('/api/guess-36/review-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }), signal: abort.signal });
      const result = await response.json();
      if (!mounted.current || abort.signal.aborted) return;
      if (!response.ok) { if (response.status === 409) localStorage.removeItem(key); throw new Error(result.error || 'Could not confirm your bonus.'); }
      localStorage.removeItem(key); setClaimed(date); onGranted();
    } catch (cause) {
      if (mounted.current) setError(abort.signal.aborted ? 'Connection slow. Check your bonus before trying again.' : cause instanceof Error ? cause.message : 'Could not confirm your bonus.');
    } finally {
      clearTimeout(timeout); controller.current = null; flight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const received = review.claimed || claimed === review.date;
  return <section className={styles.row} aria-label="Daily Expedition review bonus">
    <span>{received ? 'Today’s review bonus claimed' : '1 daily Expedition bonus'}</span>
    <a className={styles.action} href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer" aria-busy={busy} aria-disabled={disabled || busy || undefined}
      onClick={event => { if (disabled || busy) event.preventDefault(); else if (!received) void claim(); }}>
      {busy && <span className={`spinner ${styles.spinner}`} aria-hidden="true" />}{busy ? 'Claiming…' : received ? 'Review EmiGuild' : 'Leave a review'}
    </a>
    {error && <p role="alert">{error} <button type="button" className="btn btn-ghost btn-sm" disabled={busy || disabled} onClick={() => void claim()}>Check bonus</button></p>}
  </section>;
}
