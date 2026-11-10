"use client";

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Bomb, Check, Clock3, Flag, Gamepad2, Lock, Play, RefreshCw, Sparkles, Ticket, Trophy } from 'lucide-react';
import { RewardTicketCard } from './RewardTicketCard';
import { getExpeditionRewardTicketDisplay } from '@/lib/reward-ticket';
import { InfoGuideButton } from './InfoGuideButton';
import { InfoGuideModal } from './InfoGuideModal';
import type { MineColor, MineReward, MineState } from '@/lib/guess-36-mines-rules';
import { ExpeditionReviewButton } from './ExpeditionReviewButton';
import { availableMineTickets, hasMineAttempt } from '@/lib/guess-36-client';
import { useGuess36Run } from './useGuess36Run';
import styles from './guess36-mines.module.css';

const guide = [
 { title: 'Your daily expedition', description: 'One free run each IST day, plus one daily bonus from the Google review link. Bonuses expire at the end of the following IST day. The free run is used first, then your oldest bonus. The first reveal consumes a run and starts 90 seconds; the first tile can be a K.O.' },
 { title: 'Find loot. Choose when to collect.', description: '1 loot: 15 minutes. 2: 30 minutes. 3: 1 hour. 4: 2 hours. 5: Bronze Pass (10 hours), automatically collected. Each reward replaces the previous one.' },
 { title: 'Clear continues. K.O. ends the run.', description: 'Loot and clear tiles allow another pick on the same board. A K.O. loses your uncollected reward. Tile positions provide no clues.' },
 { title: 'Your time and reward', description: 'Time continues if you leave. At timeout, your current reward is secured and confirmed when you reconnect. Redeem by the end of the following IST day; show the reward to staff. Bronze Pass activation follows existing pass rules.' },
];
const RAIL = ['15m', '30m', '1h', '2h', 'Bronze'];
const RUN_SECONDS = 90;
const TILES = 36;
const REDS = 5;
const GREENS = 5;
// Presentation-only window for the just-confirmed action; never delays input.
const FLASH_MS = 1300;
const RING = 2 * Math.PI * 26;
const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const shortReward = (reward?: MineReward | null) => {
 if (!reward) return null;
 if (reward.type === 'PASS' || reward.value === undefined) return 'Bronze Pass';
 if (reward.value < 60) return `${reward.value} min`;
 const hours = reward.value / 60;
 return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
};
const bigReward = (reward: MineReward) => {
 if (reward.type === 'PASS' || reward.value === undefined) return { num: 10, unit: 'HR BRONZE PASS' };
 if (reward.value < 60) return { num: reward.value, unit: 'MIN' };
 const hours = reward.value / 60;
 return { num: hours, unit: hours === 1 ? 'HOUR' : 'HOURS' };
};
const pct = (part: number, whole: number) => whole > 0 ? Math.round((part / whole) * 100) : 0;
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Deterministic scatter so particles look random without Math.random in render.
const scatter = (seed: number) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };
const CONFETTI_COLORS = ['#2ee6a6', '#00d4ff', '#6c63ff', '#ffd36a', '#ff7ab6', '#ffffff'];

/** Feedback for an action this client just performed and the server confirmed. */
type Flash = { runId: string; version: number; index?: number; color?: MineColor; secured?: boolean };

function CountUp({ to, animate }: { to: number; animate: boolean }) {
 const [value, setValue] = useState(animate ? 0 : to);
 useEffect(() => {
  if (!animate || prefersReducedMotion() || document.hidden) { setValue(to); return; }
  let frame = 0;
  const startAt = performance.now();
  const step = (now: number) => {
   const progress = Math.min(1, (now - startAt) / 750);
   setValue(Math.round(to * (1 - Math.pow(1 - progress, 3))));
   if (progress < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
 }, [to, animate]);
 // Announce the committed value once, rather than every visual count-up frame.
 return <><span aria-hidden="true">{value}</span><span className={styles.srOnly}>{to}</span></>;
}

function Confetti({ gold }: { gold?: boolean }) {
 return <div className={styles.confetti} aria-hidden="true">
  {Array.from({ length: gold ? 24 : 18 }, (_, i) => <i key={i} style={{
   '--x': `${(scatter(i + 1) * 2 - 1) * 190}px`,
   '--y': `${-(90 + scatter(i + 7) * 170)}px`,
   '--r': `${(scatter(i + 3) * 2 - 1) * 540}deg`,
   '--d': `${scatter(i + 11) * 120}ms`,
   '--c': gold && i % 2 ? '#ffd36a' : CONFETTI_COLORS[i % CONFETTI_COLORS.length],
   '--w': `${5 + scatter(i + 5) * 5}px`,
  } as CSSProperties} />)}
 </div>;
}

export function Guess36MinesClient({ initialState, initialError }: { initialState?: MineState; initialError?: string }) {
 const { state, error, busy, pending, armed, uncertain, inspecting, announcement, seconds, now, phase, play, act, refresh, retryFirst } = useGuess36Run(initialState, initialError);
 const [info, setInfo] = useState(false);
 const [flash, setFlash] = useState<Flash | null>(null);
 const [background, setBackground] = useState(false);
 const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const flying = useRef(new Set<Animation>());
 const ticketHeading = useRef<HTMLHeadingElement | null>(null);
 const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
 const nodeRefs = useRef<(HTMLLIElement | null)[]>([]);
 const run = state?.run;
 const active = phase === 'PLAYING';
 const feedback = flash?.runId === run?.id && flash?.version === run?.version ? flash : null;
 useEffect(() => { if (armed) tileRefs.current[0]?.focus({ preventScroll: true }); }, [armed]);
 useEffect(() => {
  const effects = flying.current;
  const stop = () => { effects.forEach(effect => effect.cancel()); effects.clear(); };
  const visibility = () => { setBackground(document.hidden); if (document.hidden) { stop(); clearTimeout(flashTimer.current); setFlash(null); } };
  visibility();
  document.addEventListener('visibilitychange', visibility);
  return () => { clearTimeout(flashTimer.current); stop(); document.removeEventListener('visibilitychange', visibility); };
 }, []);

 const showFlash = (next: Flash) => {
  clearTimeout(flashTimer.current);
  if (document.hidden) return;
  setFlash(next);
  flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
 };
 const flyGem = (from?: HTMLElement | null, to?: HTMLElement | null) => {
  if (!from || !to || prefersReducedMotion() || typeof document === 'undefined' || document.hidden) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const orb = document.createElement('span');
  if (typeof orb.animate !== 'function') return;
  orb.className = styles.flyGem;
  orb.style.left = `${a.left + a.width / 2}px`;
  orb.style.top = `${a.top + a.height / 2}px`;
  document.body.appendChild(orb);
  const animation = orb.animate([
   { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
   { transform: `translate(calc(-50% + ${dx * 0.35}px), calc(-50% + ${dy * 0.35 - 46}px)) scale(1.25)`, opacity: 1, offset: 0.4 },
   { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.55)`, opacity: 0.95 },
  ], { duration: 560, easing: 'cubic-bezier(.45,0,.25,1)' });
  flying.current.add(animation);
  const remove = () => { orb.remove(); flying.current.delete(animation); };
  animation.onfinish = remove;
  animation.oncancel = remove;
 };
 const pick = async (index: number) => {
  const alreadyRevealed = run?.tiles.some(tile => tile.index === index);
  const confirmed = await act(index);
  const color = confirmed?.tiles.find(tile => tile.index === index)?.color;
  if (!confirmed || !color || alreadyRevealed) return;
  const secured = confirmed.status !== 'ACTIVE' && !!confirmed.reward;
  showFlash({ runId: confirmed.id, version: confirmed.version, index, color, secured });
  if (color === 'GREEN') flyGem(tileRefs.current[index], nodeRefs.current[confirmed.greens - 1]);
 };
 const collect = async () => {
  const confirmed = await act();
  if (confirmed && confirmed.status !== 'ACTIVE' && confirmed.reward) showFlash({ runId: confirmed.id, version: confirmed.version, secured: true });
 };
 const start = () => { clearTimeout(flashTimer.current); setFlash(null); play(); };
 const viewReward = () => {
  ticketHeading.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  ticketHeading.current?.focus({ preventScroll: true });
 };

 if (!state) return <section className={styles.game}><h1 className="font-orbitron">Guild Expedition</h1><p role="alert">{error || 'Loading your game...'}</p><button className="btn btn-secondary" disabled={busy} onClick={() => void refresh()}>{busy ? 'Checking...' : 'Retry'}</button></section>;

 const available = hasMineAttempt(state);
 const used = !available && !active;
 const tiles = new Map(run?.tiles.map(t => [t.index, t.color]));
 const canPick = !busy && !uncertain && state.authenticated && !inspecting && ((active && seconds > 0) || (!run && available && state.enabled && armed));
 const availableTickets = availableMineTickets(state, now);
 const ended = !!run && !active;
 const greens = run?.greens ?? 0;
 const lost = run?.status === 'LOST';
 const bronze = run?.status === 'COMPLETED';
 const timedOut = run?.status === 'TIMED_OUT';
 const outcome = !run ? 'idle' : active ? 'active' : lost ? 'lost' : run.reward ? 'secured' : 'empty';
 const freshGreen = feedback?.color === 'GREEN';
 const impact = feedback?.color === 'RED' ? 'RED' : freshGreen ? 'GREEN' : undefined;
 const holding = run?.reward ?? null;
 const lostStake = lost && greens > 0 ? state.rules.rewards[greens - 1] : null;
 const nextReward = run?.nextReward ?? (!run ? state.rules.rewards[0] : null);
 // Honest live odds for the next pick, from what is still hidden.
 const revealed = run?.tiles ?? [];
 const hidden = TILES - revealed.length;
 const greensLeft = GREENS - revealed.filter(t => t.color === 'GREEN').length;
 const redsLeft = REDS - revealed.filter(t => t.color === 'RED').length;
 let streak = 0;
 for (let i = revealed.length - 1; i >= 0 && revealed[i].color === 'YELLOW'; i--) streak++;
 const timeLeft = active ? seconds : RUN_SECONDS;
 const timerLevel = !active ? 'idle' : seconds <= 15 ? 'urgent' : seconds <= 30 ? 'warn' : 'calm';
 const railState = (index: number) => index < greens - 1 ? 'found'
  : index === greens - 1 ? 'current'
  : index === greens && (active || !run) ? 'next' : 'locked';
 const resultReward = run?.reward ? bigReward(run.reward) : null;
 const tier = Math.min(5, greens);
 // The first reveal is in flight: no run exists yet, so keep the start button locked.
 const opening = typeof pending === 'number' && !run;
 const live = active || armed || typeof pending === 'number' || uncertain;
 // Unclickable board with no run on it: say why, instead of just fading the tiles.
 const seal = live || run ? null : available && state.enabled ? 'ready' : !state.enabled ? 'paused' : 'locked';

 return <div className={styles.shell} data-background={background || undefined}>
  <section className={styles.game} aria-label="Guess 36 Guild Expedition" data-phase={phase} data-impact={impact}>
   <header className={styles.header}>
    <div><span className={styles.eyebrow}>GUESS 36</span><h1 className="font-orbitron">Guild Expedition</h1></div>
    <div className={styles.controls}>
     <InfoGuideButton onClick={() => setInfo(true)} ariaLabel="Guild Expedition rules" />
     <button type="button" className={styles.iconButton} aria-label="Refresh Guild Expedition" aria-busy={pending === 'refresh'} disabled={busy} onClick={() => void refresh()}>{pending === 'refresh' ? <span className={`spinner ${styles.spinner}`} aria-hidden="true" /> : <RefreshCw size={17} />}</button>
    </div>
   </header>

   {state.authenticated && <>
    <div className={styles.hud}>
     <div className={styles.rewardBox} data-outcome={outcome} data-empty={(!holding && !lostStake) || undefined} data-holding={(active && !!holding) || undefined} data-tier={tier}>
      <span className={styles.hudLabel}>{ended ? 'FINAL REWARD' : active && holding ? 'HOLDING · UNCOLLECTED' : 'REWARD'}</span>
      <strong key={`${run?.id}-${greens}-${outcome}`} className="font-orbitron" data-bump={freshGreen || undefined}>
       {holding ? shortReward(holding) : lostStake ? shortReward(lostStake) : ended ? 'None' : 'Find loot'}
      </strong>
      {active && nextReward && <span className={styles.nextHint}><Gamepad2 size={12} aria-hidden="true" /> Next loot: <b>{shortReward(nextReward)}</b></span>}
      {!run && nextReward && <span className={styles.nextHint}><Gamepad2 size={12} aria-hidden="true" /> First loot: <b>{shortReward(nextReward)}</b></span>}
     </div>
     {!ended && <div className={styles.timer} data-level={timerLevel} role="timer" aria-label={`${clock(timeLeft)} remaining`}>
      <svg viewBox="0 0 60 60" aria-hidden="true">
       <circle className={styles.timerTrack} cx="30" cy="30" r="26" />
       <circle className={styles.timerFill} cx="30" cy="30" r="26" strokeDasharray={RING} strokeDashoffset={RING * (1 - timeLeft / RUN_SECONDS)} />
      </svg>
      <strong className="font-orbitron">{clock(timeLeft)}</strong>
     </div>}
    </div>

    {!ended ? <div className={styles.odds} aria-label={`Next pick odds: ${pct(greensLeft, hidden)} percent loot, ${pct(redsLeft, hidden)} percent K.O.`}>
     <span className={styles.oddsLabel}>{active ? 'NEXT PICK' : 'ODDS'}</span>
     <span data-kind="loot"><Gamepad2 size={14} aria-hidden="true" /> {pct(greensLeft, hidden)}%</span>
     <span data-kind="clear"><Flag size={13} aria-hidden="true" /> {pct(hidden - greensLeft - redsLeft, hidden)}%</span>
     <span data-kind="ko"><Bomb size={13} aria-hidden="true" /> {pct(redsLeft, hidden)}%</span>
     {active && streak >= 3 && <span key={streak} className={styles.streak}>Streak ×{streak}</span>}
    </div> : <p className={styles.legend}><span data-kind="loot"><Gamepad2 size={13} aria-hidden="true" /> 5 loot</span><span data-kind="clear"><Flag size={12} aria-hidden="true" /> 26 clear</span><span data-kind="ko"><Bomb size={12} aria-hidden="true" /> 5 K.O.</span></p>}

    <div className={styles.boardWrap}>
     <div className={styles.board} role="group" aria-label="36 hidden tiles"
      data-live={live || undefined}
      data-armed={armed || undefined} data-impact={impact} data-ended={ended || undefined}>
      {Array.from({ length: TILES }, (_, index) => {
       const color = tiles.get(index);
       const fresh = feedback?.index === index;
       const label = color === 'GREEN' ? 'Loot' : color === 'RED' ? 'K.O.' : 'Clear';
       const Icon = color === 'GREEN' ? Gamepad2 : color === 'RED' ? Bomb : Flag;
       return <button key={index} ref={el => { tileRefs.current[index] = el; }} type="button" className={styles.tile}
        style={{ '--d': (index % 6) + Math.floor(index / 6) } as CSSProperties}
        data-color={color} data-pending={pending === index || undefined} data-fresh={fresh || undefined}
        disabled={!!color || !canPick} aria-busy={pending === index}
        aria-label={`Tile ${index + 1}${color ? `: ${label.toLowerCase()}` : ', hidden'}`}
        onClick={() => void pick(index)}>
        <span className={styles.inner}>
         <span className={styles.front} aria-hidden="true">
          {/* Brief pending feedback only; the response supplies the actual outcome. */}
          {pending === index && <span className={styles.reel}><i data-k="loot" /><i data-k="clear" /><i data-k="ko" /></span>}
          <span className={styles.rune} />
         </span>
         <span className={styles.back} aria-hidden="true">{color && <><Icon size={20} strokeWidth={2.4} /><small>{label}</small></>}</span>
        </span>
        {fresh && color === 'GREEN' && <span className={styles.sparks} aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ '--a': `${i * 60 + 15}deg` } as CSSProperties} />)}</span>}
        {fresh && <span className={styles.shock} aria-hidden="true" />}
       </button>;
      })}
      {seal && <div className={styles.seal}>
       {seal === 'ready'
        ? <button type="button" className={styles.sealBadge} data-mode="ready" disabled={busy || uncertain} onClick={start}
           aria-label={state.eligibility?.freeAvailable === false ? 'Start bonus run' : 'Start free daily run'}>
           <Play size={18} fill="currentColor" aria-hidden="true" /> Tap to start
          </button>
        : <div className={styles.sealBadge} data-mode="locked">
           <Lock size={18} aria-hidden="true" />
           {seal === 'paused' ? <span>New runs paused</span>
            : <span className={styles.sealText}><small>Next free run</small>{time(state.nextDayAt)} IST</span>}
          </div>}
      </div>}
     </div>
     {armed && <p className={styles.armHint} aria-hidden="true">Pick any tile · the clock starts on your first tap</p>}
    </div>

    <div className={styles.ladder} data-outcome={bronze ? 'bronze' : outcome}>
     <div className={styles.ladderHead}>
      <span>Rewards found <strong className="font-orbitron">{greens}<em>/5</em></strong></span>
      {active && nextReward ? <span className={styles.ladderNext}>Next loot → <b>{shortReward(nextReward)}</b></span>
       : lost && greens > 0 ? <span className={styles.ladderNext} data-lost>Run ended. Rewards lost.</span> : null}
     </div>
     <div className={styles.track}>
      <span className={styles.trackFill} style={{ transform: `scaleX(${Math.max(0, greens - 1) / 4})` }} />
      <ol aria-label={`${greens} of 5 rewards found`}>
       {RAIL.map((label, index) => {
        const value = railState(index);
        const isBronze = index === RAIL.length - 1;
        const NodeIcon = value === 'locked' ? (isBronze ? Trophy : Lock) : value === 'next' ? (isBronze ? Trophy : Gamepad2) : isBronze ? Trophy : outcome === 'secured' && value === 'current' ? Check : Gamepad2;
        return <li key={label} ref={el => { nodeRefs.current[index] = el; }} data-state={value}
         data-fresh={(freshGreen && value === 'current') || undefined} data-bronze={isBronze || undefined}
         aria-current={value === 'current' ? 'step' : undefined}>
         <span className={styles.node}><NodeIcon size={isBronze ? 16 : 14} strokeWidth={2.4} aria-hidden="true" /></span>
         <span className={styles.nodeLabel}>{label}</span>
        </li>;
       })}
      </ol>
     </div>
    </div>
   </>}

   {error && <div className={styles.error} role="alert">{error} <button type="button" disabled={busy} onClick={() => void refresh()}>Check result</button>{retryFirst && <button type="button" disabled={busy} onClick={retryFirst}>Retry first tile</button>}</div>}

   {!state.authenticated ? <div className={styles.signIn}>
    <Gamepad2 size={36} className={styles.signInIcon} aria-hidden="true" />
    <h2 className="font-orbitron">36 tiles. 5 loot. 5 K.O.</h2>
    <p>Sign in, find loot and collect before a K.O. One free run every day.</p>
    <Link className={`btn btn-primary ${styles.cta}`} data-ready="true" href="/login?callbackUrl=%2Fguess-36">Sign in to play</Link>
   </div> : active ? <>
    <button type="button" className={`btn ${styles.cta}`} data-ready={!!holding || undefined} data-tier={tier}
     data-urgent={(!!holding && seconds <= 15) || undefined} aria-busy={pending === 'collect'}
     disabled={busy || uncertain || !holding || seconds === 0} onClick={() => void collect()}>
     {pending === 'collect' ? <><span className={`spinner ${styles.spinner}`} aria-hidden="true" /> Collecting…</>
      : holding ? <><Sparkles size={18} aria-hidden="true" /> Collect {shortReward(holding)}</>
      : <><Lock size={16} aria-hidden="true" /> Find loot to unlock collect</>}
    </button>
    <p className={styles.stake}>{seconds === 0 ? 'Checking final result...'
     : holding ? <>A K.O. loses <strong data-tone="red">{shortReward(holding)}</strong>{run?.nextReward ? <> · Next loot <strong data-tone="green">{shortReward(run.nextReward)}</strong></> : null}</>
     : 'Each loot raises your reward. A K.O. ends the run.'}</p>
   </> : run ? <div className={styles.result} role="status" data-outcome={bronze ? 'bronze' : timedOut && run.reward ? 'secured' : outcome} data-fresh={feedback?.secured || undefined}>
    {feedback?.secured && <Confetti gold={bronze} />}
    <div className={styles.resultIcon} aria-hidden="true">{lost ? <Bomb size={26} /> : bronze ? <Trophy size={26} /> : timedOut ? <Clock3 size={26} /> : run.reward ? <Check size={26} strokeWidth={3} /> : <Gamepad2 size={26} />}</div>
    <p className={styles.resultKicker}>{lost ? 'K.O.' : bronze ? 'All 5 loot found' : timedOut ? 'Time is up' : run.reward ? 'Reward secured' : 'Run finished'}</p>
    {resultReward && !lost ? <div className={`${styles.resultValue} font-orbitron`}>
     <CountUp to={resultReward.num} animate={!!feedback?.secured} /><small>{resultReward.unit}</small>
    </div> : <h2 className={`${styles.resultTitle} font-orbitron`}>{lost ? 'Game Over' : 'No reward'}</h2>}
    <p className={styles.resultCopy}>{lost
     ? lostStake ? <>You were holding <b>{shortReward(lostStake)}</b>. Collect earlier next time.</> : 'No loot found this time.'
     : timedOut && run.reward ? 'Your reward was collected automatically when time ran out.'
     : run.reward ? run.ticket?.status === 'REDEEMED' ? 'Reward already redeemed.' : run.ticket && Date.parse(run.ticket.expiresAt) <= now ? 'Reward redemption deadline has passed.' : 'Added to your Reward Tickets. Show it to staff to redeem.'
     : 'No reward found.'}</p>
    {run.ticketId && !lost && <div className={styles.stub} data-fresh={feedback?.secured || undefined}><Ticket size={15} aria-hidden="true" /> Ticket printed{run.ticket?.expiresAt ? <> · redeem by {time(new Date(Date.parse(run.ticket.expiresAt) - 1).toISOString())} IST</> : null}</div>}
    <div className={styles.resultActions}>
     {available && state.enabled && <button type="button" className={`btn ${styles.cta}`} data-ready="true" disabled={busy || uncertain} onClick={start}>Play again · {state.eligibility?.freeAvailable ? 'free run' : 'bonus run'}</button>}
     <div className={styles.resultLinks}>
      {run.ticketId && <button type="button" className="btn btn-secondary btn-sm" onClick={viewReward}>View ticket</button>}
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy || uncertain} onClick={() => void refresh({ view: inspecting ? 'recover' : 'board', id: run.id })}>{inspecting ? 'Back to game' : 'View board'}</button>
      {run.date < state.date && !available && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void refresh({ view: 'current' })}>Today&apos;s expedition</button>}
     </div>
    </div>
   </div> : state.legacyUsedToday && !available ? <p className={styles.caption}>Today is already played. Return tomorrow.</p>
    : !state.enabled ? <p className={styles.caption}>New runs are paused. Existing rewards remain available.</p>
    : !available ? <p className={styles.caption}>No runs available. Claim a review bonus or return tomorrow.</p>
    : <button type="button" className={`btn ${styles.cta}`} data-ready={(!armed && !opening) || undefined} data-armed={(armed || opening) || undefined} onClick={start} disabled={armed || opening}>
     {armed || opening ? 'Pick a tile' :<><Sparkles size={18} aria-hidden="true" /> {state.eligibility?.freeAvailable === false ? 'Play bonus run' : 'Play free daily run'}</>}
    </button>}

   {state.authenticated && <div className={styles.footer}>
    {state.eligibility && <p className={styles.caption}>{state.eligibility.freeAvailable ? '1 free run available' : 'Free daily run used'} · {state.eligibility.bonuses.length} bonus {state.eligibility.bonuses.length === 1 ? 'run' : 'runs'}{state.eligibility.bonuses[0] ? ` · Next bonus expires ${time(new Date(Date.parse(state.eligibility.bonuses[0].expiresAt) - 1).toISOString())} IST` : ''}</p>}
    {state.enabled && state.eligibility && <ExpeditionReviewButton key={state.recoveryKey} review={state.eligibility.review} recoveryKey={state.recoveryKey} disabled={busy || uncertain} onGranted={() => void refresh()} />}
    {used && <p className={styles.caption}>Next run: {time(state.nextDayAt)} IST</p>}
    {!active && !ended && <p className={styles.warning}>A K.O. loses any reward you have not collected. Your first pick can be a K.O.</p>}
   </div>}
  </section>

  {state.authenticated && <section id="mine-rewards" className={styles.ticketsPanel} aria-labelledby="mine-ticket-heading">
   <header><span className={styles.eyebrow}>REWARDS</span><h2 id="mine-ticket-heading" ref={ticketHeading} tabIndex={-1} className="font-orbitron">Reward Tickets</h2></header>
   {availableTickets.length ? <div className={styles.ticketGrid}>
    {availableTickets.map(ticket => <div key={ticket.id} className={styles.ticketItem}><RewardTicketCard ticket={getExpeditionRewardTicketDisplay(ticket)} /></div>)}
   </div> : <p className={styles.empty}>{run?.ticketId ? run.ticket?.status === 'REDEEMED' ? 'Reward already redeemed.' : 'Reward redemption deadline has passed.' : 'Collect a reward to get your first ticket.'}</p>}
  </section>}
  <p className={styles.srOnly} role="status" aria-live="polite">{pending === 'refresh' ? 'Refreshing expedition.' : typeof pending === 'number' ? 'Checking tile.' : pending === 'collect' ? 'Collecting reward.' : announcement}</p>
  {info && <InfoGuideModal eyebrow="Guess 36" title="Guild Expedition" subtitle="One free daily expedition." titleId="mine-guide" steps={guide} onClose={() => setInfo(false)} lightweight />}
 </div>;
}

// Existing open tabs can still hold the earlier named client reference.
// Keep it and the page's default import pointing at the same component.
export default Guess36MinesClient;
