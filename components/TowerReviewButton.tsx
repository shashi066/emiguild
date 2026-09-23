'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { GOOGLE_REVIEW_URL, type TowerReviewState } from '@/lib/tower-review';

type TowerReviewGrant = { created: boolean; expiresAt: string };

export function TowerReviewButton({
  initialReview,
  onTokenGranted,
}: {
  initialReview?: TowerReviewState;
  onTokenGranted?: (grant: TowerReviewGrant) => void;
}) {
  const [review, setReview] = useState(initialReview);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  useEffect(() => {
    if (busy) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      clearTimeout(timer);
      try {
        const response = await fetch('/api/tower/current', { cache: 'no-store', signal: requestController.signal });
        if (response.status === 401) {
          if (!disposed) {
            setAuthRequired(true);
            setError('');
          }
          return;
        }
        if (!response.ok) throw new Error('Unable to refresh daily token.');
        const data = await response.json();
        if (disposed || submitting.current) return;
        setAuthRequired(false);
        setReview(data.review);
        setEnabled(data.enabled);
        schedule(data.review);
      } catch {
        if (!disposed && !requestController.signal.aborted) timer = setTimeout(refresh, 30_000);
      }
    };
    const schedule = (current?: TowerReviewState) => {
      const delay = current
        ? Date.parse(current.nextResetAt) - Date.parse(current.serverNow)
        : 0;
      timer = setTimeout(refresh, Math.max(1000, delay));
    };
    void refresh();
    const onFocus = () => { void refresh(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [busy]);

  async function claim() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/tower/review-token', { method: 'POST' });
      const data = await response.json();
      if (response.status === 401) {
        setAuthRequired(true);
        setError('');
        return;
      }
      if (!response.ok) throw new Error(data.error ?? 'Unable to claim your token. Please try again.');
      setAuthRequired(false);
      setReview((current) => current ? { ...current, claimed: true } : current);
      onTokenGranted?.({ created: data.created === true, expiresAt: String(data.expiresAt) });
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Unable to claim your token. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={`tower-review${review?.claimed ? ' claimed' : ''}`} aria-label="Daily Google review token">
      <div>
        <strong>{review?.claimed ? 'Today’s token claimed' : 'Get a daily Tower Token'}</strong>
        <p>1 Tower Token daily · Resets at 12 AM.</p>
      </div>
      <a
        className="tower-review-action"
        href={GOOGLE_REVIEW_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={!review?.claimed && !authRequired && enabled ? () => { void claim(); } : undefined}
        aria-busy={busy || undefined}
      >
        {busy ? 'Claiming token…' : '⭐ Leave Your Guild Mark'}
      </a>
      {authRequired && (
        <div className="tower-review-login" role="status">
          <LogIn size={20} aria-hidden="true" />
          <div><strong>Login to claim your Tower Token</strong><p>Your Google review link stays available without signing in.</p></div>
          <Link className="btn btn-primary btn-sm" href="/login?callbackUrl=/tower">Login</Link>
        </div>
      )}
      {error && <p className="tower-review-error" role="alert">{error} Use the review link again to retry your token.</p>}
      <style jsx>{`
        .tower-review { position: relative; isolation: isolate; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; margin-bottom: 16px; border: 1px solid #3b6d77; border-radius: 8px; background: #0b1421; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05); }
        .tower-review::before { content: ''; position: absolute; z-index: 0; inset: -3px; border: 1px solid #69d9e7; border-radius: 10px; pointer-events: none; opacity: 0; transform: scale(1); animation: towerReviewBorderPulse 850ms ease-in-out 3; }
        .tower-review > div { min-width: 0; }
        .tower-review strong { color: #69d9e7; font-size: .9rem; line-height: 1.25; }
        .tower-review p { margin: 5px 0 0; color: var(--color-text-secondary); font-size: .75rem; line-height: 1.4; }
        .tower-review-action { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 8px 12px; border: 1px solid #4bc487; border-radius: 6px; background: #4bc487; color: #062116; font: inherit; font-size: .81rem; font-weight: 800; text-decoration: none; cursor: pointer; max-width: 100%; white-space: normal; text-align: center; transition: transform var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast); }
        .tower-review-action:focus-visible { outline: 2px solid #69d9e7; outline-offset: 2px; }
        .tower-review-action:active { transform: scale(.98); }
        .tower-review.claimed { border-color: #3f8d67; background: #10251b; }
        .tower-review.claimed::before { border-color: #4bc487; }
        .tower-review.claimed strong { color: #d0f8e1; }
        .tower-review-login { flex-basis: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding-top: 12px; border-top: 1px solid #35445a; color: #69d9e7; }
        .tower-review-login > div { min-width: 0; }
        .tower-review-login strong { color: var(--color-text-primary); font-size: .8rem; }
        .tower-review-login p { margin-top: 2px; font-size: .7rem; }
        .tower-review .tower-review-error { flex-basis: 100%; color: var(--color-text-primary); }
        @media (hover: hover) { .tower-review-action:hover { border-color: #61d9e7; background: #61d9e7; } }
        @keyframes towerReviewBorderPulse {
          0%, 100% { opacity: .15; transform: scale(1); }
          45% { opacity: .9; transform: scale(1.015); }
        }
        @media (max-width: 480px) {
          .tower-review-action { width: 100%; }
          .tower-review-login { grid-template-columns: auto minmax(0, 1fr); }
          .tower-review-login :global(.btn) { grid-column: 1 / -1; width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .tower-review::before { animation: none; opacity: .55; transform: none; }
        }
      `}</style>
    </section>
  );
}
