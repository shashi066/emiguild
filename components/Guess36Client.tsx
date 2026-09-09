'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Clock3,
  Gift,
  Grid3X3,
  History,
  LockKeyhole,
  Target,
  TicketCheck,
  Trophy,
  X,
} from 'lucide-react';
import { AdminModalShell } from '@/components/admin/AdminModalShell';
import InfoGuideModal, { type InfoGuideStep } from '@/components/InfoGuideModal';
import InfoGuideButton from '@/components/InfoGuideButton';
import EmicRewardsButton from '@/components/EmicRewardsButton';
import { RewardTicketCard } from '@/components/RewardTicketCard';
import { EmicoinAmount } from '@/components/watch-party/EmicoinAmount';
import { getGuess36RewardTicketDisplay } from '@/lib/reward-ticket';
import {
  GUESS_36_NUMBERS, guess36CoveredNumbers,
  guess36SelectionLabel, guess36SelectionMatches, guess36Tier,
} from '@/lib/guess-36-rules';
import type { Guess36PublicState, Guess36Reward, Guess36Selection } from '@/lib/guess-36-types';
import type { Guess36Mode } from '@/lib/guess-36-types';

type PickMode = Guess36Mode;
const MODES: { id: Guess36Mode; label: string }[] = [
  { id: 'NUMBER', label: 'Number' }, { id: 'PARITY', label: 'Even/Odd' },
  { id: 'RANGE', label: 'Range' },
];
const GROUP_CHOICES: Record<Exclude<PickMode, 'NUMBER'>, Guess36Selection[]> = {
  PARITY: [{ type: 'EVEN' }, { type: 'ODD' }],
  RANGE: [1, 2, 3].map((value) => ({ type: 'RANGE', value })),
};
const MODE_PROMPTS: Record<PickMode, { title: string; description: string }> = {
  NUMBER: { title: 'Pick Your Number', description: 'Choose one number from 1-36.' },
  PARITY: { title: 'Go 50/50', description: "What's your call?" },
  RANGE: { title: 'Pick Your Zone', description: 'Cover 12 numbers.' },
};

const GUIDE_STEPS: readonly InfoGuideStep[] = [
  { title: 'Choose your pick type', description: '', visual: { kind: 'icon', icon: Target, label: 'Choose a pick type' } },
  { title: 'See your numbers', description: '', visual: { kind: 'icon', icon: Grid3X3, label: 'Covered number tiles' } },
  { title: 'Compare the reward', description: '', visual: { kind: 'icon', icon: Gift, label: 'Tier rewards' } },
  { title: 'Confirm your daily pick', description: 'Change your choice freely before confirming. Once confirmed, your one daily pick is locked until the next day.', visual: { kind: 'icon', icon: LockKeyhole, label: 'Confirm one daily pick' } },
  { title: 'Check the next result', description: 'The draw takes place at midnight. Recent Numbers shows previous results; they do not change the next draw\'s chances.', visual: { kind: 'icon', icon: History, label: 'Daily result and number history' } },
  { title: 'Receive your reward', description: 'EMIC rewards go directly to your wallet. Gaming, racing, discount, and Pass rewards become Reward Tickets to show at the counter before expiry.', visual: { kind: 'icon', icon: TicketCheck, label: 'Automatic wallet reward or counter Reward Ticket' } },
];

function guideStepsForModes(enabledModes: Guess36Mode[]): readonly InfoGuideStep[] {
  const modeCopy: Record<Guess36Mode, string> = {
    NUMBER: 'an exact number', PARITY: 'Even or Odd', RANGE: 'a 12-number range',
  };
  const choices = enabledModes.map((mode) => modeCopy[mode]);
  const choiceList = choices.length === 1 ? choices[0]
    : `${choices.slice(0, -1).join(', ')} or ${choices.at(-1)}`;
  const groups = enabledModes.filter((mode) => mode !== 'NUMBER').map((mode) => mode === 'PARITY' ? 'Even/Odd' : 'Range');
  const groupList = groups.length === 2 ? `${groups[0]} and ${groups[1]}` : groups[0];
  return GUIDE_STEPS.map((step, index) => {
    if (index === 0) return { ...step, description: `Choose ${choiceList}. Only available pick types appear here.` };
    if (index === 1) return { ...step, description: groups.length > 0
      ? `${groupList} ${groups.length === 1 ? 'shows' : 'show'} every number covered. Your pick wins if the result is one of the highlighted numbers.`
      : 'Choose one number from the 1-36 grid. Your pick wins when it matches the result.' };
    if (index === 2) return { ...step, description: 'Each available pick type shows its potential reward.' };
    return step;
  });
}

type Guess36ClientProps = {
  initialState?: Guess36PublicState;
  initialError?: string;
};

function formatDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  });
}

function selectionModeLabel(selection: Guess36Selection) {
  if (selection.type === 'NUMBER') return 'Number';
  if (selection.type === 'EVEN' || selection.type === 'ODD') return 'Even / Odd';
  if (selection.type === 'RANGE') return 'Range';
  return 'Row';
}

function Guess36RewardValue({ reward }: { reward: Guess36Reward }) {
  return reward.type === 'EMIC'
    ? <EmicoinAmount value={reward.value} />
    : <>{reward.name}</>;
}

function YesterdayNumber({ result }: { result: Guess36PublicState['previous'] }) {
  const published = result.status === 'DRAWN' && result.winningNumber !== null;

  return (
    <section className="guess-36-yesterday" aria-labelledby="yesterday-number-title">
      <div className="guess-36-yesterday-copy">
        <h2 id="yesterday-number-title">Yesterday&apos;s Number</h2>
        <time dateTime={result.date}>{formatDate(result.date)}</time>
        {!published && <strong className="guess-36-pending-result">Result pending</strong>}
      </div>
      {published ? (
        <div className="guess-36-winning-number" aria-label={`Guess 36 result ${result.winningNumber}`}>{result.winningNumber}</div>
      ) : <Clock3 size={24} aria-hidden="true" />}
    </section>
  );
}

function PreviousResult({ state }: { state: Guess36PublicState }) {
  const result = state.previous;
  if (result.status !== 'DRAWN') return null;

  return (
    <section className={`guess-36-result ${result.outcome === 'WIN' ? 'winner' : ''}`} aria-labelledby="previous-result-title">
      <header>
        <div>
          <span>Previous Result / {formatDate(result.date)}</span>
          <h2 id="previous-result-title">Yesterday&apos;s Result</h2>
        </div>
        <Clock3 size={19} aria-hidden="true" />
      </header>

      <div className="guess-36-result-detail">
        {result.outcome === 'WIN' && <p className="guess-36-win-title"><Trophy size={17} aria-hidden="true" /> {result.reward ? <>You won <Guess36RewardValue reward={result.reward} />!</> : 'Your pick won!'}</p>}
        {result.myPick && <p className="guess-36-outcome-copy">Your pick: <strong>{guess36SelectionLabel(result.myPick)}</strong></p>}
        {result.outcome === 'LOSS' && <p className="guess-36-outcome-copy">Not this time. A new day, a new chance.</p>}
        {result.outcome === 'NOT_ENTERED' && <p className="guess-36-outcome-copy">No pick for this round.</p>}
      </div>
    </section>
  );
}

export function Guess36Client({ initialState, initialError }: Guess36ClientProps) {
  const [state, setState] = useState(initialState);
  const [selection, setSelection] = useState<Guess36Selection | null>(null);
  const [mode, setMode] = useState<PickMode>(initialState?.enabledModes[0] ?? 'NUMBER');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [announcement, setAnnouncement] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [entryCutoffReached, setEntryCutoffReached] = useState(initialState?.today.status === 'CLOSED');
  const submitLock = useRef(false);

  useEffect(() => {
    if (!state || state.today.entry || state.today.status !== 'OPEN' || entryCutoffReached) return;
    const delay = new Date(state.today.entryClosesAt).getTime() - new Date(state.serverNow).getTime();
    if (delay <= 0) {
      setEntryCutoffReached(true);
      return;
    }
    const timeout = window.setTimeout(() => {
      setEntryCutoffReached(true);
      setSelection(null);
      setConfirming(false);
      setAnnouncement('Today\'s picks are locked. Result at midnight.');
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [entryCutoffReached, state]);

  const choose = (next: Guess36Selection) => {
    if (submitting) return;
    setSelection(next);
    setError('');
    setAnnouncement(`${guess36SelectionLabel(next)} selected. You can change it before confirming.`);
  };

  const submitEntry = async () => {
    if (!selection || !state || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setError('');
    setAnnouncement('Locking in your Guess 36 pick.');
    try {
      const response = await fetch('/api/guess-36/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundDate: state.today.date, selection }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.entered && data.entry) {
          setState((current) => current ? {
            ...current,
            today: { ...current.today, entry: data.entry },
          } : current);
          setConfirming(false);
          setSelection(null);
          setAnnouncement(`${guess36SelectionLabel(data.entry.selection)} is already locked for today.`);
          return;
        }
        if (data.code === 'ROUND_CLOSED') {
          setEntryCutoffReached(true);
          setConfirming(false);
          setSelection(null);
          setAnnouncement('Today\'s picks are locked. Result at midnight.');
          return;
        }
        throw new Error(data.error || 'Connection issue. Please try again.');
      }
      setState((current) => current ? {
        ...current,
        today: { ...current.today, entry: data.entry },
      } : current);
      setConfirming(false);
      setSelection(null);
      setAnnouncement(`${guess36SelectionLabel(data.entry.selection)} is locked for today.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Connection issue. Please try again.');
      setAnnouncement('Your pick was not submitted.');
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  };

  if (!state) {
    return (
      <section className="loading-state" role="alert">
        <Target size={38} aria-hidden="true" />
        <h1>Guess 36 is taking a pause</h1>
        <p>{error || 'Please refresh and try again.'}</p>
      </section>
    );
  }

  const todayClosed = state.today.status === 'CLOSED' || entryCutoffReached;
  const canPick = state.authenticated && state.eligible && state.enabled
    && state.today.status === 'OPEN' && !entryCutoffReached && !state.today.entry;
  const tier = selection ? guess36Tier(selection) : mode === 'NUMBER' ? 'EXACT' : mode === 'PARITY' ? 'PARITY' : 'GROUP';
  const reward = state.today.rewards[tier];

  const renderGroupChoices = () => {
    const choices = mode === 'NUMBER' ? [] : GROUP_CHOICES[mode];
    return (
      <div className="guess-36-groups" role="group" aria-label={`${MODES.find((item) => item.id === mode)!.label} choices`}>
        {choices.map((choice) => {
          const label = guess36SelectionLabel(choice);
          const selected = selection !== null && guess36SelectionLabel(selection) === label;
          const numbers = guess36CoveredNumbers(choice);
          return <button key={label} type="button" aria-pressed={selected} aria-label={`${label}: covers ${numbers.join(', ')}`}
            disabled={submitting} onClick={() => choose(choice)}>
            <span className="guess-36-group-heading" aria-hidden="true"><strong>{label}</strong><span>{numbers.length} numbers</span>{selected && <Check size={16} />}</span>
            <span className="guess-36-group-number-table" aria-hidden="true">{numbers.map((number) => <span key={number}>{number}</span>)}</span>
          </button>;
        })}
      </div>
    );
  };

  const renderPicker = () => {
    if (mode !== 'NUMBER') return renderGroupChoices();
    return (
      <div className="guess-36-number-grid" aria-label="Choose your Guess 36 number">
        {GUESS_36_NUMBERS.map((number) => {
          const selected = selection !== null && guess36SelectionMatches(selection, number);
          return (
            <button key={number} type="button" className={selected ? 'selected' : ''}
              aria-pressed={selected} aria-label={`Number ${number}${selected ? ', selected' : ''}`}
              onClick={() => choose({ type: 'NUMBER', value: number })} disabled={!canPick || submitting}>
              <span>{number}</span>
              {selected && <Check size={13} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="guess-36-client">
      <header className="guess-36-header">
        <div>
          <span>EMI Guild</span>
          <h1 className="font-orbitron"><Target size={22} aria-hidden="true" /> Guess 36</h1>
          <strong>One pick. Every day.</strong>
          <p>Pick today. See the result at midnight.</p>
        </div>
        <div className="guess-36-header-actions">
          <EmicRewardsButton />
          <InfoGuideButton onClick={() => setGuideOpen(true)} ariaLabel="Open How Guess 36 Works guide" />
        </div>
      </header>

      <YesterdayNumber result={state.previous} />

      <section className="guess-36-game" aria-labelledby="today-game-title">
        <header>
          <div>
            <span>Today&apos;s Game / {formatDate(state.today.date)}</span>
            <h2 id="today-game-title">What&apos;s Your Move?</h2>
            {state.today.status === 'OPEN' && !entryCutoffReached && <small>Picks close at 11:55 PM</small>}
          </div>
          <span className="guess-36-live-status">{todayClosed ? 'Picks Locked' : 'Game Live'}</span>
        </header>

        {error && !confirming && <div className="guess-36-error" role="alert">{error}</div>}

        {!state.authenticated ? (
          <div className="guess-36-state-card compact">
            <LockKeyhole size={30} aria-hidden="true" />
            <h3>Login to make today&apos;s pick</h3>
            <p>Your EMI Guild account keeps your one daily entry secure.</p>
            <Link href="/login?callbackUrl=/guess-36" className="btn btn-primary">Login</Link>
          </div>
        ) : !state.eligible ? (
          <div className="guess-36-state-card compact">
            <LockKeyhole size={30} aria-hidden="true" />
            <h3>This account cannot enter</h3>
            <p>Sign in with an eligible EMI Guild account.</p>
          </div>
        ) : state.today.entry ? (
          <div className="guess-36-locked">
            <Target size={26} aria-hidden="true" />
            <h3>You&apos;re Locked In!</h3>
            <span>Your Pick Today</span>
            <strong>{guess36SelectionLabel(state.today.entry.selection)}</strong>
            <div><LockKeyhole size={16} aria-hidden="true" /> {selectionModeLabel(state.today.entry.selection)} / Locked</div>
            <p className="guess-36-locked-reward">Potential reward: <Guess36RewardValue reward={state.today.rewards[guess36Tier(state.today.entry.selection)]} /></p>
            <p className="guess-36-result-reminder"><Clock3 size={15} aria-hidden="true" /> Result goes live at 12:00 AM</p>
            <p>Your pick cannot be changed today. Come back tomorrow to see if you hit it.</p>
          </div>
        ) : todayClosed ? (
          <div className="guess-36-state-card compact">
            <Clock3 size={30} aria-hidden="true" />
            <h3>Today&apos;s picks are locked</h3>
            <p>Result at midnight. Tomorrow brings a fresh pick.</p>
          </div>
        ) : !state.enabled || state.today.status === 'PAUSED' ? (
          <div className="guess-36-state-card compact">
            <Clock3 size={30} aria-hidden="true" />
            <h3>Guess 36 is paused</h3>
            <p>Existing picks and results are safe. Check back soon.</p>
          </div>
        ) : (
          <>
            <div className="guess-36-modes" role="group" aria-label="Pick type" style={{ gridTemplateColumns: `repeat(${state.enabledModes.length}, minmax(0, 1fr))` }}>
              {MODES.filter((item) => state.enabledModes.includes(item.id)).map((item) => <button key={item.id} type="button" aria-pressed={mode === item.id}
                disabled={submitting} onClick={() => { setMode(item.id); setSelection(null); setError(''); setAnnouncement(`${item.label} choices. Choose your pick.`); }}>{item.label}</button>)}
            </div>
            <div className="guess-36-mode-prompt">
              <strong>{MODE_PROMPTS[mode].title}</strong>
              <span>{MODE_PROMPTS[mode].description}</span>
            </div>
            <div className="guess-36-reward-preview">
              <div><span>Potential reward</span><strong><Guess36RewardValue reward={reward} /></strong></div>
            </div>
            {renderPicker()}
            <p className="guess-36-grid-help">One choice for today. Your confirmed pick cannot be changed.</p>
          </>
        )}
      </section>

      <PreviousResult state={state} />

      <section className="guess-36-history" aria-labelledby="guess-36-history-title">
        <h2 id="guess-36-history-title"><History size={18} aria-hidden="true" /> Recent Numbers</h2>
        {state.history.length > 0 ? <ol className="guess-36-history-list" tabIndex={0} aria-labelledby="guess-36-history-title">
          {state.history.map((result, index) => <li key={result.date} className={index === 0 ? 'latest' : ''}>
            <strong>{result.winningNumber}</strong><time dateTime={result.date}>{formatDate(result.date)}</time>
          </li>)}
        </ol> : <p className="guess-36-history-empty">No results yet.</p>}
      </section>

      {state.rewardTickets.length > 0 && <section className="guess-36-reward-tickets" aria-labelledby="guess-36-tickets-title">
        <h2 id="guess-36-tickets-title"><Gift size={18} aria-hidden="true" /> Reward Tickets</h2>
        <div className="guess-36-ticket-list">{state.rewardTickets.map((ticket) => <RewardTicketCard key={ticket.id} ticket={getGuess36RewardTicketDisplay(ticket)} />)}</div>
      </section>}

      {canPick && selection && (
        <div className="guess-36-selection-bar">
          <div><strong>{guess36SelectionLabel(selection)}</strong></div>
          <button className="btn btn-primary" type="button" disabled={submitting} onClick={() => setConfirming(true)}><LockKeyhole size={16} aria-hidden="true" /> Lock In My Pick</button>
        </div>
      )}

      {guideOpen && <InfoGuideModal eyebrow="Guess 36 Guide" title="How Guess 36 Works" subtitle="Choose. Confirm. Check your result." titleId="guess36-guide-title" steps={guideStepsForModes(state.enabledModes)} onClose={() => setGuideOpen(false)} closeLabel="Close Guess 36 guide" lightweight />}

      {confirming && selection && (
        <AdminModalShell onClose={() => !submitting && setConfirming(false)} labelledBy="guess-36-confirm-title" describedBy="guess-36-confirm-copy" lightweight>
          <div className="guess-36-confirm-modal">
            <header>
              <div>
                <span>Final Step</span>
                <h2 id="guess-36-confirm-title">Confirm Your Pick</h2>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={submitting} aria-label="Close confirmation"><X size={18} /></button>
            </header>
            <p id="guess-36-confirm-copy">This choice will be locked for today and cannot be changed.</p>
            <div className="guess-36-confirm-number"><span>Your pick</span><strong>{guess36SelectionLabel(selection)}</strong></div>
            <div className="guess-36-confirm-reward"><span>Potential reward</span><strong><Guess36RewardValue reward={reward} /></strong></div>
            {error && <div className="guess-36-error" role="alert">{error}</div>}
            <div className="guess-36-confirm-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setConfirming(false)} disabled={submitting}>Go Back</button>
              <button className="btn btn-primary" type="button" onClick={submitEntry} disabled={submitting} aria-busy={submitting}>
                {submitting ? <><span className="spinner guess-36-button-spinner" aria-hidden="true" /> Locking In...</> : <><LockKeyhole size={16} aria-hidden="true" /> Lock In My Pick</>}
              </button>
            </div>
          </div>
        </AdminModalShell>
      )}

      <p className="guess-36-announcement" role="status" aria-live="polite">{announcement}</p>


      <style jsx global>{`
        .guess-36-client {
          --guess36-surface: #0d1524;
          --guess36-surface-raised: #101a29;
          --guess36-border: #2b394c;
          --guess36-cyan: #61e8ff;
          --guess36-cyan-pressed: #38cfe8;
          --guess36-success: #4ade80;
          width: 100%; min-width: 0; display: grid; gap: 10px; padding-bottom: ${selection && canPick ? '88px' : '28px'};
        }
        .guess-36-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 3px 2px 5px; }
        .guess-36-header > div { min-width: 0; }
        .guess-36-announcement { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        .guess-36-header span, .guess-36-game header span, .guess-36-result header span { display: block; color: #69d9e7; font-size: .62rem; font-weight: 800; text-transform: uppercase; }
        .guess-36-header h1 { display:flex; align-items:center; gap:7px; margin: 3px 0 0; font-size: 1.14rem; line-height:1.2; letter-spacing: 0; }
        .guess-36-header h1 svg { flex:0 0 auto; color:#61e8ff; }
        .guess-36-header strong { display: block; margin-top: 4px; color: #dce6f3; font-size: .72rem; }
        .guess-36-header p { margin: 1px 0 0; color: var(--color-text-muted); font-size: .7rem; }
        .guess-36-header-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; }
        .guess-36-history-list:focus-visible { outline: 2px solid #67e8f9; outline-offset: 2px; }
        .guess-36-result, .guess-36-game { min-width: 0; border: 1px solid var(--guess36-border); border-radius: 7px; background: var(--guess36-surface); overflow: hidden; }
        .guess-36-result > header, .guess-36-game > header { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 11px; border-bottom: 1px solid #26364a; color: #67e8f9; }
        .guess-36-result h2, .guess-36-game h2 { margin: 3px 0 0; font-size: .96rem; }
        .guess-36-game > header small { display: block; margin-top: 3px; color: #8fb5c7; font-size: .68rem; font-weight: 600; }
        .guess-36-game > header { background: #0f1a28; border-bottom-color: #294251; color: #eafaff; }
        .guess-36-game header span { color: #67e8f9; }
        .guess-36-live-status { min-height: 26px; display: inline-flex !important; align-items: center; padding: 0 7px; border: 1px solid #2b6c7c; border-radius: 5px; background: #102b36; color: #a5f3fc !important; white-space: nowrap; }
        .guess-36-yesterday { min-width: 0; display: grid; grid-template-columns: minmax(0,1fr) 52px; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid #28523b; border-left:3px solid #4ade80; border-radius:7px; background: #0e1b19; color: #dbeafe; }
        .guess-36-yesterday-copy { min-width: 0; display: grid; gap: 3px; }
        .guess-36-yesterday h2 { margin: 0; color: #eafaff; font-size: .85rem; font-weight: 750; overflow-wrap: anywhere; }
        .guess-36-yesterday time { color: #8fb5c7; font-size: .72rem; }
        .guess-36-yesterday > svg { justify-self: center; }
        .guess-36-result-detail { display: grid; gap: 5px; padding: 12px; }
        .guess-36-winning-number { width: 52px; height: 52px; display: grid; place-items: center; margin: 0; border: 1px solid #4ade80; border-radius: 6px; background: #123522; color: #dcfce7; font-size: 1.4rem; font-weight: 850; }
        .guess-36-pending-result { color: #fde68a; font-size: .78rem; }
        .guess-36-win-title { margin: 0; display: flex; align-items: center; gap: 6px; color: #86efac; font-size: .82rem; font-weight: 850; overflow-wrap: anywhere; }
        .guess-36-win-title svg { flex-shrink: 0; }
        .guess-36-outcome-copy { margin: 0; color: var(--color-text-secondary); font-size: .78rem; overflow-wrap: anywhere; }
        .guess-36-outcome-copy strong { color: #e2e8f0; }
        .guess-36-grid-help { margin: 0; padding: 5px 10px 10px; color: var(--color-text-muted); font-size: .7rem; line-height: 1.4; }
        .guess-36-number-grid { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 5px; padding: 4px 9px 8px; }
        .guess-36-number-grid button { position: relative; min-width: 0; min-height: 49px; display: grid; place-items: center; border: 1px solid #304056; border-radius: 6px; background: var(--guess36-surface-raised); color: #dce6f3; font: inherit; font-size: .82rem; font-weight: 800; touch-action: manipulation; overflow: hidden; -webkit-tap-highlight-color: transparent; }
        .guess-36-number-grid button { cursor: pointer; transition: border-color 120ms ease, background 120ms ease; }
        .guess-36-number-grid button:hover:not(:disabled) { border-color: #4a7182; background: #142434; }
        .guess-36-number-grid button:active:not(.selected) { background: #121d2c; }
        .guess-36-number-grid button:focus-visible { outline: 2px solid var(--guess36-cyan); outline-offset: -3px; }
        .guess-36-number-grid button.selected,
        .guess-36-number-grid button.selected:active,
        .guess-36-number-grid button.selected:hover {
          border: 2px solid var(--guess36-cyan) !important;
          background: var(--guess36-cyan) !important;
          color: #07151b !important;
          box-shadow: none !important;
          opacity: 1 !important;
        }
        .guess-36-number-grid button:disabled:not(.selected) { opacity: .55; cursor: default; }
        .guess-36-number-grid button svg { position: absolute; top: 3px; right: 3px; color: #07151b; }
        .guess-36-state-card, .guess-36-locked { display: grid; justify-items: center; gap: 7px; padding: 22px 16px; text-align: center; color: #67e8f9; }
        .guess-36-state-card.compact { min-height: 180px; align-content: center; }
        .guess-36-state-card h1, .guess-36-state-card h3 { margin: 0; color: var(--color-text-primary); font-size: 1.05rem; }
        .guess-36-state-card p { max-width: 300px; margin: 0 0 5px; color: var(--color-text-secondary); font-size: .82rem; }
        .guess-36-locked > svg { color: #86efac; }
        .guess-36-locked h3 { margin: 0; color: #86efac; font-size: 1.05rem; }
        .guess-36-locked > span { color: #67e8f9; font-size: .68rem; font-weight: 850; text-transform: uppercase; }
        .guess-36-locked > strong { min-height: 58px; max-width: 100%; padding: 9px 20px; display: grid; place-items: center; border: 1px solid #61e8ff; border-radius: 6px; background: #102b36; color: white; font-size: 1.18rem; }
        .guess-36-locked > div { display: flex; align-items: center; gap: 6px; color: #cbd5e1; font-size: .8rem; font-weight: 750; }
        .guess-36-locked p { margin: 0; color: var(--color-text-secondary); font-size: .76rem; overflow-wrap: anywhere; }
        .guess-36-locked .guess-36-result-reminder { display: flex; align-items: center; justify-content: center; gap: 6px; color: #fde68a; font-weight: 750; }
        .guess-36-error { margin: 10px 10px 0; padding: 9px 10px; border-left: 3px solid #fb7185; background: rgba(127,29,29,.22); color: #fecdd3; font-size: .78rem; }
        .guess-36-selection-bar { position: fixed; z-index: 80; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: minmax(0,1fr) minmax(150px,168px); gap: 7px; padding: 9px max(10px, env(safe-area-inset-right)) calc(9px + env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); border-top: 1px solid #35445a; background: #0b1421; }
        .guess-36-selection-bar > div:first-child { display: grid; align-content: center; gap: 2px; }
        .guess-36-selection-bar span { color: var(--color-text-muted); font-size: .72rem; }
        .guess-36-selection-bar strong { color: #67e8f9; font-size: .9rem; }
        .guess-36-selection-bar button { min-width: 0; min-height: 46px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding-inline: 8px; font-size: .74rem; white-space: nowrap; }
        .guess-36-confirm-modal { --guess36-cyan: #61e8ff; --guess36-cyan-pressed: #38cfe8; min-width: 0; display: grid; gap: 13px; padding: 16px; }
        .guess-36-confirm-modal header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .guess-36-confirm-modal header span { color: #67e8f9; font-size: .65rem; font-weight: 850; text-transform: uppercase; }
        .guess-36-confirm-modal h2 { margin: 3px 0 0; font-size: 1.15rem; }
        .guess-36-confirm-modal > p { margin: 0; color: var(--color-text-secondary); font-size: .82rem; }
        .guess-36-confirm-number { min-height: 88px; display: grid; place-items: center; align-content: center; gap: 2px; border: 1px solid rgba(103,232,249,.38); border-radius: 7px; background: #10202c; }
        .guess-36-confirm-number span { color: #a6b6c9; font-size: .7rem; }
        .guess-36-confirm-number strong { color: #67e8f9; font-size: 1.5rem; }
        .guess-36-confirm-reward { display: grid; gap: 3px; color: #86efac; overflow-wrap: anywhere; }
        .guess-36-confirm-reward span { color: var(--color-text-secondary); font-size: .75rem; }
        .guess-36-modes { display: grid; gap:4px; margin: 9px; padding:3px; border: 1px solid #2b394c; border-radius: 7px; background:#0b1220; overflow: hidden; }
        .guess-36-modes button { min-width: 0; min-height: 44px; padding: 4px 2px; border: 0; border-radius:5px; background: transparent; color: #94a3b8; font: inherit; font-size: .74rem; font-weight: 800; cursor: pointer; transition: background 120ms ease, color 120ms ease; }
        .guess-36-modes button[aria-pressed="true"] { background: var(--guess36-cyan); color: #07151b; }
        .guess-36-modes button:disabled:not([aria-pressed="true"]) { opacity: .5; }
        .guess-36-mode-prompt { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 1px 10px 7px; }
        .guess-36-mode-prompt strong { color: #eafaff; font-size: .82rem; }
        .guess-36-mode-prompt span { color: #8fa0b4; font-size: .7rem; text-align: right; }
        .guess-36-reward-preview { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin:0 9px 9px; padding: 8px 9px; border-left:2px solid #f4cf58; background:#121a25; }
        .guess-36-reward-preview > div { min-width: 0; display: grid; gap: 2px; }
        .guess-36-reward-preview span { color: #afbed0; font-size: .7rem; }
        .guess-36-reward-preview > span { flex-shrink: 0; }
        .guess-36-reward-preview strong { color: #f4cf58; font-size: .8rem; overflow-wrap: anywhere; }
        .guess-36-groups { display: grid; gap: 7px; padding: 0 9px 9px; }
        .guess-36-groups button { min-width: 0; min-height: 68px; display: grid; gap: 8px; padding: 12px; border: 1px solid #30435b; border-radius: 6px; background: var(--guess36-surface-raised); color: #e2e8f0; font: inherit; font-size: .83rem; text-align: left; touch-action: manipulation; cursor: pointer; transition: border-color 120ms ease, background 120ms ease; }
        .guess-36-groups button[aria-pressed="true"] {
          border: 2px solid var(--guess36-cyan) !important;
          background: #10212d !important;
          color: #a5f3fc !important;
          box-shadow: none !important;
          opacity: 1;
        }
        .guess-36-groups button:disabled:not([aria-pressed="true"]) { opacity: .5; }
        .guess-36-group-heading { display: grid; grid-template-columns: minmax(0,1fr) auto 16px; gap: 8px; align-items: center; min-height: 20px; }
        .guess-36-group-heading > span { font-size: .68rem; color: #afbed0; }
        .guess-36-groups button[aria-pressed="true"] .guess-36-group-heading > span { color: #8fb5c7; }
        .guess-36-group-number-table { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 4px; }
        .guess-36-group-number-table > span { min-width: 0; height: 29px; display: grid; place-items: center; border: 1px solid #30445a; border-radius: 4px; background: #101a26; color: #c9d7e6; font-size: .7rem; font-weight: 750; }
        .guess-36-groups button[aria-pressed="true"] .guess-36-group-number-table > span { border-color: var(--guess36-cyan); background: var(--guess36-cyan); color: #07151b; }
        .guess-36-history, .guess-36-reward-tickets { min-width: 0; padding:8px 2px 0; }
        .guess-36-history h2, .guess-36-reward-tickets h2 { display: flex; align-items: center; gap: 7px; margin: 0 0 8px; font-size: .92rem; }
        .guess-36-history h2 svg, .guess-36-reward-tickets h2 svg { color: #67e8f9; }
        .guess-36-history-list { display: flex; gap: 6px; max-width: 100%; margin: 0; padding: 2px 2px 8px; overflow-x: auto; list-style: none; }
        .guess-36-history-list li { flex: 0 0 56px; min-height: 66px; display: grid; align-content: center; justify-items: center; gap: 4px; border: 1px solid #2b394c; border-radius: 6px; background: #101827; }
        .guess-36-history-list li.latest { border-color: #3d7180; background: #102b36; }
        .guess-36-history-list strong { color: #d7e7f3; font-size: 1.05rem; }
        .guess-36-history-list time { color: #afbed0; font-size: .65rem; }
        .guess-36-history-empty { margin: 0; padding: 12px 0; color: var(--color-text-secondary); font-size: .8rem; }
        .guess-36-ticket-list { display: grid; gap: 10px; }
        .guess-36-modes button:focus-visible, .guess-36-groups button:focus-visible { outline: 2px solid var(--guess36-cyan); outline-offset: -3px; }
        .guess-36-client .btn-primary, .guess-36-confirm-modal .btn-primary { background: var(--guess36-cyan); color: #082029; box-shadow: none; }
        .guess-36-client .btn-primary:active:not(:disabled), .guess-36-confirm-modal .btn-primary:active:not(:disabled) { background: var(--guess36-cyan-pressed); transform: scale(.99); }
        .guess-36-confirm-actions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 8px; }
        .guess-36-confirm-actions button { min-width: 0; min-height: 46px; }
        .guess-36-button-spinner { width: 15px; height: 15px; border-width: 2px; }
        @media (min-width: 520px) {
          .guess-36-ticket-list { grid-template-columns: repeat(2,minmax(0,1fr)); }
        }
        @media (min-width: 720px) {
          .guess-36-selection-bar { right: auto; left: 50%; width: min(480px, calc(100% - 24px)); transform: translateX(-50%); border: 1px solid #3a4c63; border-bottom: 0; border-radius: 7px 7px 0 0; }
        }
        @media (max-width: 380px) {
          .guess-36-header strong { font-size:.69rem; }
          .guess-36-header p { max-width:210px; }
          .guess-36-number-grid { gap:4px; padding-inline:7px; }
          .guess-36-number-grid button { min-height:46px; }
          .guess-36-mode-prompt { align-items:flex-start; flex-direction:column; gap:1px; }
          .guess-36-mode-prompt span { text-align:left; }
          .guess-36-selection-bar { grid-template-columns:minmax(0,1fr) minmax(142px,158px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .guess-36-number-grid button { transition: none; }
          .guess-36-button-spinner { animation: none; }
        }
      `}</style>
    </div>
  );
}
