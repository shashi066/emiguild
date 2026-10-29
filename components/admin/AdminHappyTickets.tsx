'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ticket, RotateCcw, RotateCw, Check, Archive } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { PendingRewardError, submitRewardRequest } from '@/lib/reward-request-client';
import type { HappyConfig } from '@/lib/happy-ticket-rules';
import styles from './HappyTicketsAdmin.module.css';
type AdminData = { pool: { available: number; version: number; config: HappyConfig }; counts: { issued: number; redeemed: number; expired: number }; flags: Record<string, boolean>; stations: { id: string; name: string }[]; tickets: any[]; resets: any[]; events: any[]; nextCursor: string | null };
function stamp(value: string | null) { return value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
export function AdminHappyTickets() {
  const { data: session } = useSession();
  const [data, setData] = useState<AdminData | null>(null); const [config, setConfig] = useState<HappyConfig | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState<{ id: string; action: string } | null>(null);
  const [reason, setReason] = useState('');
  const [pendingAction, setPendingAction] = useState<{ kind: string; input: Record<string, unknown> } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const resetTrigger = useRef<HTMLElement | null>(null); const flight = useRef(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const refresh = useCallback(async (cursor?: string) => {
    const response = await fetch(`/api/admin/happy-tickets${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store' });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to load management.');
    setData(body); setConfig(body.pool.config);
  }, []);
  useEffect(() => { void refresh().catch(e => setError(e.message)); }, [refresh]);
  useEffect(() => {
    if (!session?.user?.id) return;
    try { for (const op of ['GUILD_RESET']) if (localStorage.getItem(`emiguild:reward:${session.user.id}:${op}`)) { setRecovery(op); break; } }
    catch { setError('Browser storage is needed for safe request recovery.'); }
  }, [session?.user?.id]);
  const submit = async (kind: string, input: Record<string, unknown>, recoverOperation?: string) => {
    if (!session?.user?.id || flight.current) return;
    flight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (kind === 'RESET' || recoverOperation) {
        const saved = await submitRewardRequest(session.user.id, recoverOperation ?? 'GUILD_RESET', '/api/admin/happy-tickets', recoverOperation ? JSON.parse(localStorage.getItem(`emiguild:reward:${session.user.id}:${recoverOperation}`) || '{}').payload : { kind, input });
        setCommitted({ id: saved.reset.id, action: saved.reset.status === 'CANCELLED' ? 'CANCEL' : saved.reset.status === 'PENDING' ? 'BANK' : 'REFILL' });
      } else {
        const response = await fetch('/api/admin/happy-tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, input }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Action failed.');
      }
      setRecovery(null); setNotice(kind === 'RESET' || recoverOperation ? 'Reset saved.' : 'Eligibility saved.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); if (e instanceof PendingRewardError) setRecovery(recoverOperation ?? 'GUILD_RESET'); }
    finally { flight.current = false; setBusy(false); }
  };
  useEffect(() => { const hide = () => { if (document.hidden) setCommitted(null); }; document.addEventListener('visibilitychange', hide); return () => document.removeEventListener('visibilitychange', hide); }, []);
  const closeReset = () => { dialog.current?.close(); resetTrigger.current?.focus(); };
  const confirmReset = (action: string, resetId?: string, trigger?: HTMLElement) => {
    resetTrigger.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setPendingAction({ kind: 'RESET', input: { action, resetId, reason, version: data?.pool.version } }); dialog.current?.showModal();
  };
  return <div className={styles.root}><div className={styles.heading}><div><Ticket size={24} aria-hidden="true" /><h1>Happy Tickets</h1></div><button className="btn btn-secondary" disabled={busy} onClick={() => void refresh().catch(e => setError(e.message))}>{busy ? <span className="spinner" aria-hidden="true" /> : <RotateCw size={16} aria-hidden="true" />} Refresh</button></div>
    {notice && <p className={styles.notice} role="status"><Check size={16} aria-hidden="true" />{notice}</p>}{error && <p role="alert">{error}</p>}
    {recovery && <div className={styles.panel}><p>Previous request needs confirmation.</p><button className="btn btn-primary" disabled={busy} onClick={() => void submit('RESET', {}, recovery)}>Check result / Retry</button></div>}
    {!data || !config ? error ? <button type="button" className="btn btn-secondary" onClick={() => void refresh().then(() => setError('')).catch(e => setError(e.message))}>Retry loading tickets</button> : <div className={styles.loading} role="status"><Ticket size={30} /><span className="spinner" aria-hidden="true" /> Loading tickets...</div> : <>
      <section className={styles.panel}><div className={styles.poolHeader}><h2>Ticket pool</h2><strong>{data.pool.available}<small> / 5 available</small></strong></div>
        <div key={committed?.action === 'REFILL' ? committed.id : 'pool'} className={`${styles.poolSlots} ${committed?.action === 'REFILL' ? styles.refill : ''}`} aria-hidden="true">{Array.from({length:5},(_,i)=><span key={i} data-available={i<data.pool.available} style={{'--ticket-index':i} as React.CSSProperties}><Ticket size={24}/></span>)}</div>
        <div className={styles.stats}><span><strong>{data.counts.issued}</strong>Issued</span><span><strong>{data.counts.redeemed}</strong>Used</span><span><strong>{data.counts.expired}</strong>Expired</span></div>
        <div className={styles.grid}><fieldset><legend>PS5 stations</legend>{data.stations.map(s => <label key={s.id}><input type="checkbox" checked={config.stationIds.includes(s.id)} onChange={e => setConfig({ ...config, stationIds: e.target.checked ? [...config.stationIds, s.id] : config.stationIds.filter(id => id !== s.id) })} />{s.name}</label>)}</fieldset>
          <fieldset><legend>Eligible days</legend>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((name, i) => <label key={name}><input type="checkbox" checked={config.days.includes(i)} onChange={e => setConfig({ ...config, days: e.target.checked ? [...config.days, i].sort() : config.days.filter(d => d !== i) })} />{name}</label>)}</fieldset>
          <div><label>From (IST)<input type="time" step="1800" value={config.startTime} onChange={e => setConfig({ ...config, startTime: e.target.value })} /></label><label>To (IST)<input type="time" step="1800" value={config.endTime} onChange={e => setConfig({ ...config, endTime: e.target.value })} /></label><button className="btn btn-primary" disabled={busy} onClick={() => void submit('CONFIG', { config, version: data.pool.version })}>Save eligibility</button></div>
        </div>
      </section>
      <section className={styles.panel}><h2 className={styles.sectionTitle}><RotateCcw size={18} aria-hidden="true" /> Guild Resets / Banked Resets</h2><label>Reason<input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label><div className={styles.row}><button className="btn btn-primary" disabled={busy || !reason.trim()} onClick={e => confirmReset('FORCE', undefined, e.currentTarget)}>{busy ? <span className="spinner" aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />} Refill pool to five</button><button className="btn btn-secondary" disabled={busy || !reason.trim()} onClick={e => confirmReset('BANK', undefined, e.currentTarget)}><Archive size={16} aria-hidden="true" /> Create banked reset</button></div>
        <div className={styles.table}><table><thead><tr><th>Reset</th><th>Status</th><th>Expires (IST)</th><th>Action</th></tr></thead><tbody>{data.resets.length === 0 && <tr><td colSpan={4}>No banked resets yet. Enter a reason above, then create one.</td></tr>}{data.resets.map(r => <tr key={r.id} className={committed?.id === r.id ? styles.saved : undefined}><td>{r.kind}<br />{r.reason}<br /><small>{r.id}</small></td><td>{r.status}</td><td>{stamp(r.expiresAt)}</td><td>{r.status === 'PENDING' && <><button className="btn btn-ghost" disabled={busy || !reason.trim()} onClick={e => confirmReset('CANCEL', r.id, e.currentTarget)}>Cancel</button></>}</td></tr>)}</tbody></table></div>
      </section>
      <section className={styles.panel}><h2>Tickets</h2><div className={styles.table}><table><thead><tr><th>Member</th><th>Claimed (IST)</th><th>Expiry (IST)</th><th>Status / booking</th></tr></thead><tbody>{data.tickets.map(t => <tr key={t.id}><td>{t.user.name}<br />{t.user.email}</td><td>{stamp(t.claimedAt)}</td><td>{stamp(t.expiresAt)}</td><td>{t.status === 'CLAIMED' && Date.parse(t.expiresAt) <= Date.now() ? 'Expired' : t.status === 'REDEEMED' ? 'Used' : t.status === 'CLAIMED' ? 'Available' : 'Expired'}<br />{t.redemptions.map((r: any) => <span key={r.id}><a href={`/admin/bookings?search=${encodeURIComponent(t.user.email)}`}>#{r.bookingId.slice(-8).toUpperCase()}</a> · {r.status === 'APPLIED' ? 'Applied' : 'Returned'}<br /></span>)}</td></tr>)}</tbody></table></div><div className={styles.row}><button className="btn btn-ghost" onClick={() => void refresh().catch(e => setError(e.message))}>Latest tickets</button>{data.nextCursor && <button className="btn btn-secondary" onClick={() => void refresh(data.nextCursor!).catch(e => setError(e.message))}>Older tickets</button>}</div></section>

      <details className={styles.panel}><summary>Reset history</summary><p className={styles.muted}>Latest 100 refills.</p>{data.events.map(e => <p key={e.id}>{stamp(e.createdAt)} · {e.kind} · {e.before} → {e.after}</p>)}</details>
    </>}
    <dialog ref={dialog} onCancel={e => { e.preventDefault(); closeReset(); }} className={styles.dialog} aria-labelledby="reset-confirm-title"><h2 id="reset-confirm-title">Confirm reset action</h2><p>{pendingAction?.input.action === 'BANK' ? 'Store one reset entitlement. The pool will stay unchanged.' : pendingAction?.input.action === 'CANCEL' ? 'Cancel this unused entitlement.' : 'Restore available tickets to exactly five. Existing claims and cooldowns stay valid.'}</p><div className={styles.row}><button className="btn btn-secondary" onClick={closeReset}>Back</button><button className="btn btn-primary" onClick={() => { closeReset(); if (pendingAction) void submit(pendingAction.kind, pendingAction.input); }}>Confirm</button></div></dialog>
  </div>;
}
