'use client';
import { useEffect, useState } from 'react';
import { LifecyclePreview, SuppressionReason, formatVaultTime } from '@/lib/lifecycle/rules';
import styles from './lifecycle.module.css';
type Player = { id: string; name: string; email: string };
const reasons: Record<SuppressionReason, string> = {
  CHANNEL_DISABLED: 'This email campaign is switched off.', CHANNEL_UNAVAILABLE: 'The registered email address is invalid.',
  RECENT_VISIT: 'Player visited within the last 72 hours.', FREQUENCY_CAP: 'An email was already sent within the last seven days.', NO_ELIGIBLE_ITEMS: 'No current rewards or opportunities to mention.',
  UNSUBSCRIBED: 'Player has stopped lifecycle emails.', ACCOUNT_TOO_NEW: 'Account is less than 72 hours old.', ACTIVITY_FOUND: 'Player used at least one of the three activities in the last 72 hours.',
  FEATURE_DISABLED: 'One of the three activities is paused or unavailable.', HISTORY_UNAVAILABLE: 'Game history could not be checked reliably.', CHECK_NOT_DUE: 'The next three-day check is not due yet.', DIGEST_NOT_DUE: 'The account was created after this week’s digest target.', PENDING_DELIVERY: 'An email is currently being sent.', TRANSPORT_UNAVAILABLE: 'Production Gmail delivery is not configured and enabled.',
};
export function LifecyclePreviewClient() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<Player | null>(null);
  const [preview, setPreview] = useState<LifecyclePreview | null>(null);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setUsers([]); setSearchError('');
    const timer = window.setTimeout(async () => {
      if (query.trim().length < 2) return;
      try {
        const response = await fetch(`/api/admin/lifecycle/preview?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setUsers(body.users);
      } catch { if (!controller.signal.aborted) setSearchError('Player search failed. Please try again.'); }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);
  useEffect(() => {
    setPreview(null); setError('');
    if (!selected) return;
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/admin/lifecycle/preview?userId=${encodeURIComponent(selected.id)}`, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setPreview(body);
      } catch { if (!controller.signal.aborted) setError('Preview could not be loaded. Please try again.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [selected, revision]);
  return <div style={{ paddingTop: 24 }}>
    <h2>Player message preview</h2>
    <p className={styles.muted}>Preview only. Nothing is sent, no visits are recorded here, and no delivery allowance is consumed. The same registered email, activity history, and send limits are used for scheduled delivery.</p>
    <section className={`card ${styles.panel}`}><label className={styles.field}>Find a player<input className={styles.select} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type at least two letters of a name or email" /></label>
      {searchError && <p role="alert" className={styles.error}>{searchError}</p>}
      <div className={styles.results}>{users.map((user) => <button type="button" className="btn btn-secondary" key={user.id} onClick={() => setSelected(user)} aria-pressed={selected?.id === user.id}>{user.name} · {user.email}</button>)}</div>
      {query.trim().length >= 2 && !users.length && !searchError && <p className={styles.muted}>No players shown. Try a name or email.</p>}
    </section>
    {selected && <div className={styles.header}><h2>{selected.name}</h2><button className="btn btn-secondary btn-sm" disabled={loading} onClick={() => setRevision((value) => value + 1)}>Refresh preview</button></div>}
    {loading && <p role="status">Checking current account items…</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
    {preview && <>
      <section className={`card ${styles.panel}`}><h2>Current account facts</h2>{preview.state.items.length ? <ul>{preview.state.items.map((item) => <li key={item.id}>{item.title} — {item.description}</li>)}</ul> : <p>No eligible items.</p>}</section>
      <section className={`card ${styles.panel}`}><h2>Last 72 hours</h2><p className={styles.time}>{preview.activity.start && formatVaultTime(preview.activity.start)} to {formatVaultTime(preview.activity.end)}</p><p>Spins: {preview.activity.spin} · Forges: {preview.activity.forge} · Guess 36 entries: {preview.activity.guess36}</p><p>Next comeback check: {preview.nextComebackCheckAt ? formatVaultTime(preview.nextComebackCheckAt) : 'At the next scheduled run once the account is 72 hours old'}</p></section>
      <div className={styles.grid}>{(['comeback', 'digest'] as const).map((campaign) => <section key={campaign} className={`card ${styles.card}`}>
        <h2>{campaign === 'comeback' ? 'Three-day comeback email' : 'Weekly email digest'}</h2>
        <p className={styles.muted}>{preview[campaign].eligible ? 'Eligible. The scheduled run rechecks the account before sending.' : 'Suppressed.'}</p>
        {preview[campaign].suppressionReasons.length > 0 && <ul>{preview[campaign].suppressionReasons.map((reason) => <li key={reason}>{reasons[reason]}</li>)}</ul>}
        {preview[campaign].candidate && <h3>{preview[campaign].candidate!.subject}</h3>}
        <div className={styles.copy}>{preview[campaign].candidate?.text ?? 'Nothing to send.'}</div>
      </section>)}</div>
      <section className={`card ${styles.panel}`}><h2>Shared seven-day history</h2>{preview.history.length ? <ul>{preview.history.map((row, index) => <li key={index}>{row.campaign === 'COMEBACK' ? 'Comeback' : 'Digest'} · {row.status.toLowerCase()} · {formatVaultTime(row.at)}</li>)}</ul> : <p>No sends in the last seven days.</p>}</section>
    </>}
  </div>;
}
