'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Clock3, Gamepad2, RotateCcw, Ticket } from 'lucide-react';
import { HappyTicketArtwork } from './HappyTicketArtwork';
import styles from './HappyTickets.module.css';

export type DispenserProps = {
  available: number; resets: number; version: number; signedIn: boolean; enabled: boolean; resetsEnabled: boolean;
  cooldown: string | null; claiming: boolean; resetting: boolean; pendingClaim: boolean; pendingReset: boolean;
  claimResult?: { id: string; expires: string; href: string } | null;
  refill: string; loading?: boolean; hours: string; warning?: string;
  onClaim: () => void; onReset: () => void;
};
export function HappyTicketDispenser(p: DispenserProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const resultLine = useRef<HTMLDivElement>(null);
  const wasResetting = useRef(false);
  const [confirmationVersion, setConfirmationVersion] = useState(p.version);
  const busy = p.claiming || p.resetting;
  const close = () => { dialog.current?.close(); resetButton.current?.focus(); };
  useEffect(() => {
    if (p.resetting) dialog.current?.close();
    else if (wasResetting.current) {
      if (p.refill) resultLine.current?.focus({ preventScroll: true });
      else resetButton.current?.focus();
    }
    wasResetting.current = p.resetting;
  }, [p.resetting, p.refill]);
  const canClaim = p.pendingClaim || (p.enabled && p.available > 0 && !p.cooldown);
  const canReset = p.pendingReset || (p.resetsEnabled && p.resets > 0);
  if (p.loading) return <div className={styles.loader} role="status" aria-live="polite">
    <div className={styles.loadingTickets} aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => <span className={styles.loadingTicket} key={i} style={{ '--ticket-index': i } as React.CSSProperties}><span className={styles.loadingHighlight} /><Ticket size={23} strokeWidth={1.5} /></span>)}
    </div>
    <span>Loading Happy Tickets...</span>
  </div>;
  return <div className={styles.game}>
    <div className={`${styles.dispenser} ${p.loading ? styles.loadingDispenser : ''}`}>
      <div key={'ticket-' + (p.claimResult?.id || p.refill || 'ready')} className={`${styles.artworkWrap} ${p.claimResult ? styles.dispensed : p.refill ? styles.restocked : ''}`}>
        <HappyTicketArtwork available={p.available} />
      </div>
      <div className={styles.dispenserSlot} aria-hidden="true" />
      <div key={'marks-' + (p.refill || 'availability')} className={`${styles.availability} ${p.refill ? styles.refilling : ''}`} aria-hidden="true">{Array.from({length:5},(_,i)=><span key={i} data-filled={i < p.available} style={{'--ticket-index':i} as React.CSSProperties} />)}</div>
      {!p.loading && <div className={styles.poolLabel}><strong>{p.signedIn ? `Your tickets: ${p.available}/5` : '5 tickets per account'}</strong><span>{p.signedIn ? 'Only for your account' : 'Sign in to view your balance'}</span></div>}
    </div>
    {p.loading ? <p className={styles.loadingCaption} role="status">Loading Happy Tickets...</p> : <>
      <div ref={resultLine} tabIndex={-1} className={styles.resultLine} aria-hidden={!p.claimResult && !p.refill}>{p.claimResult ? <><Check size={17} aria-hidden="true" /> Your ticket is ready</> : p.refill ? <><Check size={17} aria-hidden="true" /> Your tickets refilled</> : null}</div>
      <div className={styles.actions}>
        {p.claimResult ? <Link className={styles.primary} href={p.claimResult.href}>Book your hour <Gamepad2 size={18} aria-hidden="true" /></Link> : p.signedIn ? <button className={styles.primary} disabled={busy || p.pendingReset || !canClaim} onClick={p.onClaim} aria-busy={p.claiming}>{p.claiming ? <><span className="spinner" aria-hidden="true" /> Claiming...</> : p.pendingClaim ? 'Check claim result' : p.cooldown ? <><Clock3 size={16} aria-hidden="true" /> Claimed · {p.cooldown} left</> : !p.enabled ? 'Claims unavailable' : !p.available ? 'No tickets available' : <><Ticket size={18} aria-hidden="true" /> Claim Ticket</>}</button> : <Link className={styles.primary} href="/login?callbackUrl=/happy-tickets">Sign in to claim</Link>}
        {p.signedIn ? <button ref={resetButton} className={styles.resetButton} disabled={busy || p.pendingClaim || !canReset} aria-busy={p.resetting} onClick={() => { if(p.pendingReset) p.onReset(); else { setConfirmationVersion(p.version); dialog.current?.showModal(); } }}><RotateCcw key={p.refill || 'reset'} className={p.refill ? styles.resetTurn : ''} size={18} aria-hidden="true" />{p.resetting ? <><span className="spinner" aria-hidden="true" /> Refilling...</> : p.pendingReset ? 'Check reset result' : 'Reset My Tickets'}<span className={styles.resetCount}>{p.resets}</span></button> : <Link className={styles.resetButton} href="/login?callbackUrl=/happy-tickets"><RotateCcw size={18} aria-hidden="true" /> Sign in to reset <span className={styles.resetCount}>{p.resets}</span></Link>}
      </div>
      {p.claimResult && <p className={styles.supporting}>Expires {p.claimResult.expires}</p>}
      {!p.resetsEnabled && <p className={styles.supporting}>Resets paused</p>}
      {p.warning && <p className={styles.warning}>{p.warning}</p>}
      <dialog ref={dialog} className={styles.resetDialog} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();close();}}>
        <h2 id={titleId}>Refill your tickets?</h2>
        <div className={styles.resetPreview}><span>{p.available}<small> / 5</small></span><RotateCcw size={24} aria-hidden="true" /><span>5<small> / 5</small></span></div>
        <p>Uses 1 banked reset. Refills only your tickets to five.</p><p className={styles.muted}>Your claim cooldown stays the same.</p>
        {p.available === 5 && <p className={styles.warning}>Your tickets are already full. This still uses one reset.</p>}
        {confirmationVersion !== p.version && <p role="status">Tickets changed. Go back and review the new count.</p>}
        <div className={styles.dialogActions}><button className={styles.secondary} onClick={close}>Back</button><button className={styles.primary} disabled={busy || !canReset || confirmationVersion !== p.version} onClick={()=>{close();p.onReset();}}>Use Reset</button></div>
      </dialog>
    </>}
  </div>;
}
