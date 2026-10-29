'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import { HAPPY_TICKET_TEXTURE } from './HappyTicketArtwork';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { RotateCw, ArrowUpRight } from 'lucide-react';
import { HappyTicketDispenser } from './HappyTicketDispenser';
import { RewardTicketCard } from './RewardTicketCard';
import { HappyTicketInfo } from './HappyTicketInfo';
import { PendingRewardError, submitRewardRequest } from '@/lib/reward-request-client';
import styles from './HappyTickets.module.css';

type TicketRecord = { id: string; status: string; expiresAt: string; redemptions: { bookingId: string }[] };
type State = { pool: { available: number; capacity: number; version: number; banked?: { count: number; next: { id: string; expiresAt: string } | null; enabled: boolean }; enabled: boolean; noEligibleWindow: boolean; serverNow: string; lastRefill?: { id: string; createdAt: string } | null; rules: { days: number[]; startTime: string; endTime: string } }; wallet: { tickets: TicketRecord[]; nextClaimAt: string | null } | null };
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const expiryLabel = (value: string) => new Date(Date.parse(value) - 1).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });


export function HappyTicketPanel({ compact = false }: { compact?: boolean }) {
  preload(HAPPY_TICKET_TEXTURE, { as: 'image', fetchPriority: 'high' });
  useEffect(() => {
    for (const src of [HAPPY_TICKET_TEXTURE]) {
      const texture = new Image();
      texture.decoding = 'async';
      texture.src = src;
      // Cache the active artwork during the entrance loader; failures never block it.
      void texture.decode().catch(() => {});
    }
  }, []);
  const { data: session, status: sessionStatus } = useSession();
  const [entranceReady, setEntranceReady] = useState(compact);
  useEffect(() => {
    if (compact) return;
    const timer = setTimeout(() => setEntranceReady(true), 5000);
    return () => clearTimeout(timer);
  }, [compact]);
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [pending, setPending] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [serverNow, setServerNow] = useState(0);
  const [refill, setRefill] = useState(''); const [revealed, setRevealed] = useState(''); const [used, setUsed] = useState<string[]>([]);
  const ownRefill = useRef(false);
  const flight = useRef(false); const generation = useRef(0); const previous = useRef<State | null>(null);
  const identity = useRef(session?.user?.id); identity.current = session?.user?.id;
  const refresh = useCallback(async () => {
    const id = ++generation.current; setLoading(true);
    try {
      const response = await fetch('/api/happy-tickets', { cache: 'no-store' }); const data: State = await response.json();
      if (!response.ok) throw new Error((data as unknown as { error: string }).error || 'Unable to load tickets.');
      if (generation.current !== id) return;
      const old = previous.current;
      if (old && data.pool.lastRefill?.id && old.pool.lastRefill?.id !== data.pool.lastRefill.id && !ownRefill.current && !document.hidden) { setRefill(data.pool.lastRefill.id); setMessage('Pool refilled.'); }
      ownRefill.current = false;
      const newlyUsed = data.wallet?.tickets.filter(t => t.status === 'REDEEMED' && old?.wallet?.tickets.some(o => o.id === t.id && o.status === 'CLAIMED')).map(t => t.id) ?? [];
      setUsed(newlyUsed);
      if (newlyUsed.length) setMessage('Happy Ticket used for your booking.');
      previous.current = data; setState(data); setServerNow(Date.parse(data.pool.serverNow)); setError('');
    } catch (cause) { if (generation.current === id) setError(cause instanceof Error ? cause.message : 'Unable to load tickets.'); }
    finally { if (generation.current === id) setLoading(false); }
  }, []);
  useEffect(() => {
    if (sessionStatus === 'loading') return;
    const requests = generation;
    previous.current = null; setState(null); setMessage(''); setResetPending(false); setPending(false); setRefill(''); setRevealed('');
    try { setResetPending(!!localStorage.getItem(`emiguild:reward:${session?.user?.id}:HAPPY_RESET`)); setPending(!!localStorage.getItem(`emiguild:reward:${session?.user?.id}:HAPPY_CLAIM`)); } catch { /* Claim reports storage errors. */ }
    void refresh();
    const onVisibility = () => { setHidden(document.hidden); if (document.hidden) { setRefill(''); setRevealed(''); setUsed([]); } if (!document.hidden) { setRevealed(''); void refresh(); } };
    const onFocus = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onVisibility);
    return () => { requests.current++; window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); };
  }, [session?.user?.id, sessionStatus, refresh]);
  useEffect(() => {
    if (!state) return;
    const epoch = Date.parse(state.pool.serverNow); const anchor = performance.now();
    const tick = () => setServerNow(epoch + performance.now() - anchor);
    tick(); const timer = setInterval(tick, 60_000); return () => clearInterval(timer);
  }, [state]);
  const claim = async () => {
    const owner = session?.user?.id;
    if (!owner || flight.current) return;
    flight.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await submitRewardRequest(owner, 'HAPPY_CLAIM', '/api/happy-tickets/claim', {});
      if (identity.current !== owner) return;
      generation.current++; setPending(false); setRefill(''); setRevealed(document.hidden ? '' : result.ticket.id);
      // Reflect a committed receipt even if the subsequent pool refresh fails.
      setState(old => old ? { ...old, wallet: { nextClaimAt: result.nextClaimAt, tickets: [{ ...result.ticket, redemptions: [] }, ...(old.wallet?.tickets.filter(t => t.id !== result.ticket.id) ?? [])] } } : old);
      setMessage('Happy Ticket claimed. Your free hour is ready.'); void refresh();
    } catch (cause) { if (identity.current === owner) { setPending(cause instanceof PendingRewardError); setError(cause instanceof Error ? cause.message : 'Unable to claim.'); } }
    finally { flight.current = false; setBusy(false); }
  };
  const activateReset = async () => {
    const owner = session?.user?.id;
    if (!owner || flight.current || !state) return;
    flight.current = true; setResetBusy(true); setError(''); setMessage('');
    try {
      const saved = localStorage.getItem(`emiguild:reward:${owner}:HAPPY_RESET`);
      const payload = saved ? JSON.parse(saved).payload : { resetId: state.pool.banked?.next?.id, version: state.pool.version };
      const result = await submitRewardRequest(owner, 'HAPPY_RESET', '/api/happy-tickets/reset', payload);
      if (identity.current !== owner) return;
      generation.current++; ownRefill.current = true; setResetPending(false); setRevealed('');
      setRefill(document.hidden ? '' : result.resetId);
      setState(old => old ? { ...old, pool: { ...old.pool, available: result.available, banked: old.pool.banked ? { ...old.pool.banked, count: Math.max(0, old.pool.banked.count - 1) } : undefined } } : old);
      setMessage('Pool refilled.'); void refresh();
    } catch (cause) { if (identity.current === owner) { setResetPending(cause instanceof PendingRewardError); setError(cause instanceof Error ? cause.message : 'Unable to use reset.'); } }
    finally { flight.current = false; setResetBusy(false); }
  };
  const remaining = Math.max(0, Date.parse(state?.wallet?.nextClaimAt ?? '') - serverNow) || 0;
  const tickets = state?.wallet?.tickets ?? [];
  const Heading = compact ? 'h2' : 'h1';
  const cooldown = `${Math.floor(Math.ceil(remaining / 60_000) / 60)}h ${Math.ceil(remaining / 60_000) % 60}m`;
  const isAvailable = (ticket: TicketRecord) => ticket.status === 'CLAIMED' && Date.parse(ticket.expiresAt) > serverNow;
  const renderTicket = (ticket: TicketRecord) => {
    const status = ticket.status === 'CLAIMED' && !isAvailable(ticket) ? 'EXPIRED' : ticket.status;
    return <article key={`${ticket.id}-${status}`} className={`${styles.ticket} ${used.includes(ticket.id) ? styles.reveal : ''}`} data-status={status}>
      <RewardTicketCard ticket={{ id: ticket.id, kind: 'gaming', label: 'Happy Ticket', value: '1 hr', origin: status === 'CLAIMED' ? 'Available' : status === 'REDEEMED' ? 'Used' : 'Expired', description: 'One free base PS5 screen-hour', expiry: 'Expires ' + expiryLabel(ticket.expiresAt) + ' IST' }} />
      {status === 'CLAIMED' && <Link className={styles.ticketLink} href={`/book?happyTicket=${encodeURIComponent(ticket.id)}`}>Book with ticket <ArrowUpRight size={15} /></Link>}
      {status === 'REDEEMED' && ticket.redemptions[0] && <Link className={styles.ticketLink} href={`/book/confirm?id=${ticket.redemptions[0].bookingId}`}>View booking <ArrowUpRight size={15} /></Link>}
    </article>;
  };
  return <section className={`${styles.panel} ${compact ? styles.compact : ''}`} data-hidden={hidden || undefined} aria-label="Happy Tickets">
    <header className={styles.head}>
      <Heading>Happy Tickets</Heading>
      <div className={styles.tools}><HappyTicketInfo hours={state ? `${state.pool.rules.days.map(d=>days[d]).join(" / ")} | ${state.pool.rules.startTime} - ${state.pool.rules.endTime} IST` : undefined} resets={state?.pool.banked?.count} /><button type="button" className={styles.iconButton} onClick={() => void refresh()} disabled={loading || busy || resetBusy} aria-label="Refresh Happy Tickets">{loading && state ? <span className="spinner" aria-hidden="true" /> : <RotateCw size={16} />}</button></div>
    </header>
    {(!state || (!entranceReady && !error)) ? error ? <div className={styles.error} role="alert"><span>{error}</span><button type="button" className={styles.secondary} onClick={() => void refresh()} disabled={loading}>Retry</button></div> : <HappyTicketDispenser available={5} resets={0} version={0} signedIn={false} enabled={false} resetsEnabled={false} cooldown={null} claiming={false} resetting={false} pendingClaim={false} pendingReset={false} refill="" hours="" loading onClaim={()=>{}} onReset={()=>{}} /> : <>
      <HappyTicketDispenser available={state.pool.available} resets={state.pool.banked?.count ?? 0} version={state.pool.version} signedIn={!!session?.user?.id} enabled={state.pool.enabled} resetsEnabled={state.pool.banked?.enabled ?? false} cooldown={remaining ? cooldown : null} claiming={busy} resetting={resetBusy} pendingClaim={pending} pendingReset={resetPending}
        claimResult={revealed && tickets.find(t=>t.id===revealed && t.status==='CLAIMED' && Date.parse(t.expiresAt)>serverNow) ? { id: revealed, expires: expiryLabel(tickets.find(t=>t.id===revealed)!.expiresAt) + ' IST', href: `/book?happyTicket=${encodeURIComponent(revealed)}` } : null}
        refill={refill} hours={`${state.pool.rules.days.map(d=>days[d]).join(' / ')} | ${state.pool.rules.startTime} - ${state.pool.rules.endTime} IST`}
        warning={state.pool.noEligibleWindow ? "You can’t use a new ticket today. There’s no eligible 1-hour slot left before it expires tonight." : undefined} onClaim={()=>void claim()} onReset={()=>void activateReset()} />
    {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" className={styles.secondary} onClick={() => void (resetPending ? activateReset() : pending ? claim() : refresh())} disabled={loading || busy || resetBusy}>{pending ? 'Check result / Retry' : 'Retry'}</button></div>}
      {tickets.length > 0 && <section className={styles.wallet} aria-label="Your Happy Tickets">
        <div className={styles.sectionHeading}><h2>Your tickets</h2><span>{tickets.filter(isAvailable).length} ready</span></div>
        <div className={styles.list}>{tickets.filter(isAvailable).map(renderTicket)}</div>
        {tickets.some(t=>!isAvailable(t)) && <details className={styles.history}><summary>History ({tickets.filter(t=>!isAvailable(t)).length})</summary><div className={styles.list}>{tickets.filter(t=>!isAvailable(t)).map(renderTicket)}</div></details>}
      </section>}
    </>}
    <p className="sr-only" role="status" aria-live="polite">{message}</p>


  </section>;
}
