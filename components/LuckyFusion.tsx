'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown, Shield, Hand, Footprints, Sparkles, Combine, X, ArrowLeft, ArrowRight, Plus, HelpCircle } from 'lucide-react';
import { FUSION_ODDS, type FusionInput, type FusionTier } from '@/lib/armory-fusion-rules';
import styles from './LuckyFusion.module.css';

type Artifact = { id: string; name: string; setId: string; slotType: string; active?: boolean; set: { rarity: string; active?: boolean } };
type State = {
  artifacts: Artifact[];
  inventory: { artifactId: string; quantity: number; artifact: Artifact }[];
  loadout: Record<string, Artifact | null>;
  fusion?: { enabled: boolean };
};
export function LuckyFusion({ state, userId, busy, onBusy, refresh }: {
  state: State; userId: string; busy: boolean; onBusy: (value: boolean) => void;
  refresh: () => Promise<unknown>;
}) {
  const popup = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const [tier, setTier] = useState<FusionTier>('BRONZE');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [choice, setChoice] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [received, setReceived] = useState<{name:string; rarity:string; slotType?:string} | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [pending, setPending] = useState<FusionInput | null>(null);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const [mounted, setMounted] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const key = `emiguild-fusion-v1:${userId}`;
  const equippedIds = Object.values(state.loadout).filter(Boolean).map(a => a!.id);
  const available = (row: State['inventory'][number]) => Math.max(0, row.quantity - equippedIds.filter(id => id === row.artifactId).length);
  const active = state.artifacts.filter(a => a.active && a.set.active);
  const poolReady = Object.keys(FUSION_ODDS[tier]).every(t => active.some(a => a.set.rarity === t));
  const total = Object.values(selected).reduce((a, b) => a + b, 0);
  const disabled = busy || working || Boolean(pending) || !ready;

  useEffect(() => {
    alive.current = true;
    setMounted(true);
    setReady(false); setPending(null); setSelected({}); setResult(''); setReceived(null); setError('');
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const value = JSON.parse(saved) as FusionInput;
        if (typeof value.requestId !== 'string' || !Array.isArray(value.ingredients)) throw new Error();
        setPending(value);
        setResult('A previous fusion needs checking. Recover it before starting another.');
      }
    } catch { setError('Fusion recovery storage is unavailable or invalid. Do not start another fusion until it is resolved.'); return () => { alive.current = false; }; }
    setReady(true);
    return () => { alive.current = false; };
  }, [key]);

  useEffect(() => { if (reviewing) reviewHeading.current?.focus(); }, [reviewing]);

  async function finish(output: {name:string;rarity:string;slotType?:string}) {
    setReceived(output); setResult('Fusion complete.');
    setPending(null);
    setSelected({});
    localStorage.removeItem(key);
    await refresh();
  }
  async function submit(input: FusionInput) {
    if (lock.current) return;
    lock.current = true; setWorking(true); onBusy(true); setError('');
    try {
      // Persist before dispatch; storage failure prevents an unrecoverable request.
      localStorage.setItem(key, JSON.stringify(input)); setPending(input);
      const response = await fetch('/api/armory/fusion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const data = await response.json();
      if (!alive.current) return;
      if (!response.ok) {
        if (data.definitive) { localStorage.removeItem(key); setPending(null); await refresh(); }
        throw new Error(data.error || 'Could not confirm fusion. Recover or retry the same request.');
      }
      await finish(data.output);
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Could not confirm fusion.'); }
    finally { lock.current = false; if (alive.current) { setWorking(false); onBusy(false); } }
  }
  async function recover() {
    if (!pending || lock.current) return;
    lock.current = true; setWorking(true); onBusy(true); setError('');
    try {
      const response = await fetch(`/api/armory/fusion?requestId=${encodeURIComponent(pending.requestId)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!alive.current) return;
      if (data.receipt) await finish(data.receipt.output);
      else setResult('No committed receipt yet. Retry the same fusion safely; do not start a new one.');
    } catch { if (alive.current) setError('Could not check fusion. Your request is saved; try recovery again.'); }
    finally { lock.current = false; if (alive.current) { setWorking(false); onBusy(false); } }
  }
  const rows = state.inventory.filter(r => r.artifact.active && r.artifact.set.active && r.artifact.set.rarity === tier && available(r) > 0);
  const canReview = !disabled && state.fusion?.enabled && poolReady && total === 3 && (tier !== 'PLATINUM' || Boolean(choice));
  const icons = { HEADGEAR: Crown, ARMOR: Shield, GLOVES: Hand, BOOTS: Footprints };
  const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();
  const ingredients = Object.entries(selected).flatMap(([id, n]) => Array.from({length:n}, () => state.artifacts.find(a => a.id === id)!)).filter(Boolean);
  const chosen = active.find(a => a.id === choice);
  function add(id: string, max: number) {
    setSelected(current => {
      const count = Object.values(current).reduce((a,b) => a+b,0);
      if (disabled || count >= 3 || (current[id] ?? 0) >= max) return current;
      return {...current, [id]: (current[id] ?? 0)+1};
    });
  }
  function icon(slot?:string, size=26) { const Icon = icons[slot as keyof typeof icons] ?? Sparkles; return <Icon size={size} aria-hidden="true" />; }
  const odds = <div className={styles.odds} aria-label="Result probabilities">{Object.entries(FUSION_ODDS[tier]).map(([name, chance]) => <span key={name} data-tier={name}>{label(name)} <strong>{chance}%</strong></span>)}</div>;
  const recipe = <div className={styles.recipe}>
    {[0,1,2].map(index => { const item=ingredients[index]; return <button type="button" key={index} className={styles.slot} data-tier={tier} disabled={!item || disabled || reviewing} aria-label={item ? `Remove ${item.name}, ingredient ${index+1}` : `Empty ingredient ${index+1}`} title={item?.name} onClick={() => setSelected(current => ({...current,[item.id]:Math.max(0,(current[item.id]??0)-1)}))}>{item ? icon(item.slotType,24) : <Plus size={18} aria-hidden="true" />}</button>; })}
    <ArrowRight className={styles.arrow} size={18} aria-hidden="true" />
    <button type="button" className={`${styles.slot} ${styles.output}`} data-tier={tier === 'PLATINUM' ? tier : undefined} disabled={tier !== 'PLATINUM' || disabled || reviewing} aria-label={chosen ? `Change result: ${chosen.name}` : tier === 'PLATINUM' ? 'Choose result' : 'Mystery result'} title={chosen?.name} onClick={() => setChoosing(true)}>{chosen ? icon(chosen.slotType,24) : tier === 'PLATINUM' ? <Plus size={18} aria-hidden="true" /> : <span className={styles.mystery}>?</span>}</button>
  </div>;
  return <div className={styles.root}>
    <button ref={launcher} className={styles.launcher} aria-label={pending ? 'Recover fusion' : 'Lucky Fusion'} title="Lucky Fusion" type="button" aria-haspopup="dialog" onClick={() => { setReviewing(false); setChoosing(false); popup.current?.showModal(); }}><Combine size={16} aria-hidden="true" /><span className={styles.launcherLabel}>{pending ? 'Recover fusion' : 'Lucky Fusion'}</span></button>
    {mounted && createPortal(<dialog ref={popup} className={styles.dialog} aria-labelledby="lucky-fusion-title" onClose={() => launcher.current?.focus()}>
      <header className={styles.header}><h2 id="lucky-fusion-title">Lucky Fusion</h2><button type="button" className={styles.close} aria-label="Close Lucky Fusion" onClick={() => popup.current?.close()}><X size={20} /></button></header>
      <div className={styles.body}>
        <p className={styles.srOnly} role="status">{working ? 'Fusing...' : received ? `Received ${received.name}, ${received.rarity}` : result || `${total} of 3 ingredients selected`}</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {received ? <div className={styles.result} data-tier={received.rarity}><span className={styles.resultIcon}>{icon(received.slotType,52)}</span><small>{label(received.rarity)}</small><h3>{received.name}</h3></div> : pending ? <div className={styles.recovery}><Sparkles size={32} /><h3>{working ? 'Fusing...' : 'Fusion saved'}</h3>{!working && <div className={styles.recoveryActions}><button className={styles.primary} onClick={recover}>Check result</button><button className={styles.secondary} onClick={() => submit(pending)}>Retry</button></div>}</div> : choosing ? <>
          <h3 ref={reviewHeading} tabIndex={-1} className={styles.reviewHeading}>Choose result</h3>
          <div className={styles.cards}>{active.filter(a => a.set.rarity === 'PLATINUM').map(a => <button key={a.id} className={styles.card} data-tier="PLATINUM" aria-pressed={choice === a.id} onClick={() => {setChoice(a.id);setChoosing(false);}}>{icon(a.slotType)}<strong>{a.name}</strong></button>)}</div>
        </> : <>
          {!reviewing && <div className={styles.tiers} role="group" aria-label="Ingredient tier">{Object.keys(FUSION_ODDS).map(t => <button type="button" key={t} data-tier={t} aria-pressed={tier === t} disabled={disabled} onClick={() => {setTier(t as FusionTier);setSelected({});setChoice('');}}>{label(t)}</button>)}</div>}
          {reviewing && <h3 ref={reviewHeading} tabIndex={-1} className={styles.reviewHeading}>Ready to fuse?</h3>}
          {recipe}
          {tier === 'PLATINUM' && <p className={styles.choice}>{chosen?.name ?? 'Choose result'}</p>}
          {odds}
          {reviewing ? <p className={styles.warning}>Consumes these 3 items. Returns 1.</p> : <>
            {!state.fusion?.enabled && <p className={styles.warning}>Fusion is paused.</p>}
            {!poolReady && <p className={styles.warning}>Tier unavailable.</p>}
            <div className={styles.cards}>{rows.map(r => <button type="button" key={r.artifactId} className={styles.card} data-tier={tier} data-selected={Boolean(selected[r.artifactId])} aria-label={`Add ${r.artifact.name}`} disabled={disabled || total >= 3 || (selected[r.artifactId]??0) >= available(r)} onClick={() => add(r.artifactId,available(r))}>
              {icon(r.artifact.slotType)}<strong>{r.artifact.name}</strong><span className={styles.cardMeta}><small>{available(r)} available</small><span aria-label={`${selected[r.artifactId]??0} selected`}>{selected[r.artifactId]??0}<Plus size={12} aria-hidden="true" /></span></span>
            </button>)}</div>
            {!rows.length && <p className={styles.empty}>No spare {label(tier).toLowerCase()} items.</p>}
            <details className={styles.info}><summary><HelpCircle size={14} aria-hidden="true" />Info</summary><p>Three same-tier items return one of the same tier or higher. Results can repeat owned items. Equipped copies cannot be used. No guaranteed upgrade or pity counter. Platinum lets you choose your result.</p></details>
          </>}
        </>}
      </div>
      <footer className={styles.footer}>
        {received ? <button className={styles.primary} onClick={() => {popup.current?.close();setReceived(null);setResult('');}}>Done</button> : pending ? <button className={styles.secondary} onClick={() => popup.current?.close()}>Close</button> : <>
          {reviewing || choosing ? <button className={styles.secondary} disabled={working} onClick={() => {setReviewing(false);setChoosing(false);requestAnimationFrame(() => confirmButton.current?.focus());}}><ArrowLeft size={16} aria-hidden="true" />Back</button> : <span className={styles.counter}>{total} / 3 <small>selected</small></span>}
          {!choosing && (reviewing ? <button className={styles.primary} disabled={!canReview} onClick={() => {setReviewing(false);void submit({requestId:crypto.randomUUID(),ingredients:Object.entries(selected).filter(([,n])=>n>0).map(([artifactId,quantity])=>({artifactId,quantity})),...(tier === 'PLATINUM' ? {chosenOutputId:choice} : {})});}}>Fuse</button> : <button ref={confirmButton} className={styles.primary} disabled={!canReview} onClick={() => setReviewing(true)}>Review</button>)}
        </>}
      </footer>
    </dialog>, document.body)}
  </div>;
}
