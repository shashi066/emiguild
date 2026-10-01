'use client';
import { useEffect, useState } from 'react';
import { formatVaultTime } from '@/lib/lifecycle/rules';
import styles from './lifecycle.module.css';
type Row = { id: string; campaign: string; recipient: string; status: string; dispatchedAt: string; finishedAt: string | null; errorCode: string | null; user: { name: string } };
export function EmailHistoryClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load(next?: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/lifecycle/history' + (next ? '?cursor=' + encodeURIComponent(next) : ''), { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const body = await response.json();
      setRows((old) => next ? [...old, ...body.deliveries] : body.deliveries); setCursor(body.nextCursor);
    } catch { setError('Delivery history could not be loaded.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  return <section className={styles.panel}>
    <div className={styles.header}><h2>Delivery history</h2><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => load()}>Refresh</button></div>
    <p className={styles.muted}>Accepted means Gmail accepted the email, not confirmed inbox delivery. Unknown emails are never automatically resent.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!rows.length && !busy && !error && <p>No emails sent yet.</p>}
    {rows.map((row) => <article className={'card ' + styles.card} key={row.id}><h3>{row.user.name} · {row.campaign === 'COMEBACK' ? 'Comeback' : row.campaign === 'TEST' ? 'Admin test' : 'Weekly digest'}</h3><p className={styles.muted}>{row.recipient}</p><p><strong>{row.status.toLowerCase()}</strong> · {formatVaultTime(row.dispatchedAt)}</p>{row.errorCode && <p className={styles.error}>{row.errorCode}</p>}</article>)}
    {busy && <p role="status">Loading history…</p>}{cursor && <button className="btn btn-secondary" disabled={busy} onClick={() => load(cursor)}>Load more</button>}
  </section>;
}
