'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUp,
  BookOpen,
  Castle,
  Check,
  Clock3,
  Coins,
  Gift,
  Info,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  Trophy,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import InfoGuideModal from '@/components/InfoGuideModal';
import { RewardTicketCard } from '@/components/RewardTicketCard';
import { AdminModalShell } from '@/components/admin/AdminModalShell';
import { getTowerRewardTicketDisplay } from '@/lib/reward-ticket';
import {
  getTowerFloorPresentation,
  getTowerFocusedLevel,
  getTowerMiniCardPresentation,
  getTowerRedCardRevealDelay,
  getTowerScrollBehavior,
  getTowerScreen,
  isTowerSafeReplayStale,
  orderTowerFloors,
  shouldShowTowerAttemptExpiry,
  TOWER_RED_CARD_REVEAL_MS,
  type TowerFloorPresentation,
  type TowerScrollReason,
} from '@/lib/tower-view';
import {
  TOWER_WARNING_THRESHOLD_MS,
  createTowerClockAnchor,
  formatTowerCountdown,
  getTowerRemainingMs,
  type TowerClockAnchor,
} from '@/lib/tower-clock';

type TowerReward = {
  id: string;
  name: string;
  type: 'DISCOUNT' | 'GAMING_TIME' | 'RACING_TIME' | 'PASS';
  value?: number;
  passType?: string;
};
type TowerCard = { id: string };
type TowerFloor = { level: number; reward: TowerReward };
type TowerHistory = { level: number; selectedPosition: number; result: 'SAFE' | 'LOSS' };
type TowerReveal = { level: number; redPosition: number };
type TowerRewardTicket = { id: string; reward: TowerReward; expiresAt: string };
type TowerAttemptState = {
  attemptId: string;
  level: number;
  totalLevels: number;
  status: 'IN_PROGRESS' | 'LOST' | 'COMPLETED' | 'CLAIMED' | 'TIMED_OUT' | 'EXPIRED';
  securedReward: TowerReward | null;
  canClaim: boolean;
  expiresAt: string;
  runExpiresAt: string;
  serverNow: string;
  floors: TowerFloor[];
  history: TowerHistory[];
  reveal?: TowerReveal[];
  cards: TowerCard[];
};
type TowerState = {
  enabled: boolean;
  availableTokens: number;
  nextTokenExpiresAt: string | null;
  rewardTickets: TowerRewardTicket[];
  attempt: TowerAttemptState | null;
};
type PickResult = {
  result: 'SAFE' | 'LOSS';
  reward?: TowerReward;
  completed: boolean;
  attempt: TowerAttemptState;
};
type TowerRedCardReveal = { cardId: string };
type TowerPendingAction = 'start' | 'pick' | 'climb' | 'claim' | 'refresh' | null;
type TowerClientProps = { initialState?: TowerState; initialError?: string };

const TOWER_SAFE_CARD_PULSE_MS = 700;

const GUIDE_STEPS = [
  {
    title: 'Start Your Climb',
    description: 'After a successful linked booking check-in, you get 1 Tower Token for one climb. Use it before the shown expiry.',
    visual: { kind: 'icon', icon: Coins, label: 'Tower Token' },
  },
  {
    title: 'Climb 10 Floors',
    description: 'The Tower has 10 floors, and each floor has a reward. Climb higher to unlock bigger rewards.',
    visual: { kind: 'icon', icon: Castle, label: 'Ten-floor Tower' },
  },
  {
    title: 'Pick a Card',
    description: 'Each floor has 3 cards - 2 Green and 1 Red. Pick one card to reveal your result.',
    visual: { kind: 'cards', state: 'hidden', label: 'Three hidden cards' },
  },
  {
    title: 'Green Card',
    description: 'A Green Card unlocks the reward for that floor. Take it to create a counter Reward Ticket and redeem it before expiry, or risk it and climb to the next floor.',
    visual: { kind: 'cards', state: 'safe', label: 'Green safe card' },
  },
  {
    title: 'Red Card',
    description: 'A Red Card ends your climb immediately, and you lose all unclaimed rewards.',
    visual: { kind: 'cards', state: 'red', label: 'Red card' },
  },
  {
    title: 'Beat the Clock',
    description: 'You have 120 seconds to complete your climb and take a reward. When time runs out, your climb ends and all unclaimed rewards are lost.',
    visual: { kind: 'icon', icon: Timer, label: '120-second timer' },
  },
] as const;

function rewardLabel(reward: TowerReward | null | undefined) {
  if (!reward) return 'Ready to climb';
  if (reward.type === 'DISCOUNT') return `${reward.value ?? 0}% Booking Discount`;
  return reward.name;
}

function formatExpiry(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function scrollTowerFloor(element: HTMLElement | null, behavior: ScrollBehavior) {
  if (!element) return;
  if (behavior === 'smooth') {
    element.scrollIntoView({ block: 'center', behavior });
    return;
  }

  const root = document.documentElement;
  const previousBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  element.scrollIntoView({ block: 'center', behavior: 'auto' });
  root.style.scrollBehavior = previousBehavior;
}

function initialRemaining(attempt: TowerAttemptState | null | undefined) {
  if (!attempt || !['IN_PROGRESS', 'COMPLETED'].includes(attempt.status)) return null;
  const serverNow = Date.parse(attempt.serverNow);
  const runExpiresAt = Date.parse(attempt.runExpiresAt);
  if (!Number.isFinite(serverNow) || !Number.isFinite(runExpiresAt)) return null;
  return Math.max(0, runExpiresAt - serverNow);
}

function attemptMessage(attempt: TowerAttemptState | null, result: PickResult | null) {
  if (result?.result === 'LOSS') return 'Red card ends this climb. Come back stronger next time.';
  if (result?.result === 'SAFE' && result.completed) return 'Top floor cleared. Take your reward.';
  if (result?.result === 'SAFE') return `${rewardLabel(result.reward)} secured. Take it or climb.`;
  if (attempt?.status === 'LOST') return 'Red card ends this climb. Come back stronger next time.';
  if (attempt?.status === 'COMPLETED') return 'Tower cleared. Your top reward is ready.';
  if (attempt?.status === 'CLAIMED') return 'Reward taken. The full tower is revealed.';
  if (attempt?.status === 'TIMED_OUT') return 'Time is up. Your next climb is a fresh start.';
  if (attempt?.status === 'EXPIRED') return 'This Tower attempt expired.';
  if (attempt?.status === 'IN_PROGRESS' && attempt.canClaim && attempt.securedReward) {
    return `${rewardLabel(attempt.securedReward)} secured. Take it or climb.`;
  }
  return 'Choose one card on the highlighted floor.';
}

export function TowerClient({ initialState, initialError = '' }: TowerClientProps) {
  const [state, setState] = useState<TowerState>(initialState ?? { enabled: true, availableTokens: 0, nextTokenExpiresAt: null, rewardTickets: [], attempt: null });
  const [settling, setSettling] = useState(true);
  const [result, setResult] = useState<PickResult | null>(null);
  const [pendingAction, setPendingAction] = useState<TowerPendingAction>(null);
  const [selectedCard, setSelectedCard] = useState('');
  const [error, setError] = useState(initialError);
  const [guideOpen, setGuideOpen] = useState(false);
  const [claimedTicket, setClaimedTicket] = useState<TowerRewardTicket | null>(null);
  const [redCardReveal, setRedCardReveal] = useState<TowerRedCardReveal | null>(null);
  const [clockAnchor, setClockAnchor] = useState<TowerClockAnchor | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(() => initialRemaining(initialState?.attempt));
  const [timerAnnouncement, setTimerAnnouncement] = useState('');
  const currentFloorRef = useRef<HTMLElement | null>(null);
  const rewardTicketsRef = useRef<HTMLElement | null>(null);
  const rewardTicketsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const scrollToTicketsAfterCloseRef = useRef(false);
  const redCardRevealTimerRef = useRef<number | null>(null);
  const scrollReasonRef = useRef<TowerScrollReason>('restore');
  const initialSettlingRef = useRef(true);
  const warningAttemptRef = useRef('');
  const timeoutAttemptRef = useRef('');
  const attempt = state.attempt;
  const loading = pendingAction !== null;
  const isPicking = pendingAction === 'pick';
  const isClimbing = pendingAction === 'climb';
  const isClaiming = pendingAction === 'claim';
  const activeAttemptId = attempt?.attemptId;
  const activeAttemptStatus = attempt?.status;
  const screen = getTowerScreen({
    enabled: state.enabled,
    availableTokens: state.availableTokens,
    attemptStatus: attempt?.status,
    loading: loading && !attempt,
    error: attempt ? '' : error,
  });
  const timedStatus = shouldShowTowerAttemptExpiry(attempt?.status);
  const redCardRevealActive = redCardReveal !== null;
  const runIsOpen = remainingMs === null || remainingMs > 0;
  const canPick = Boolean(attempt?.status === 'IN_PROGRESS' && !attempt.canClaim && runIsOpen && !result && !loading && !redCardRevealActive);
  const canClaim = Boolean(attempt?.canClaim && runIsOpen && !redCardRevealActive);
  const timerWarning = Boolean(timedStatus && remainingMs !== null && remainingMs > 0 && remainingMs <= TOWER_WARNING_THRESHOLD_MS);
  const timerEnded = Boolean(timedStatus && remainingMs === 0);
  const announcement = attemptMessage(attempt, result);
  const pendingAnnouncement = isPicking
    ? 'Revealing your card.'
    : isClimbing
      ? 'Climbing to the next floor.'
      : isClaiming
        ? 'Securing your Reward Ticket.'
        : '';
  const floors = useMemo(() => orderTowerFloors(attempt?.floors ?? []), [attempt?.floors]);
  const historyByLevel = useMemo(() => new Map((attempt?.history ?? []).map((item) => [item.level, item])), [attempt?.history]);
  const revealByLevel = useMemo(() => new Map((attempt?.reveal ?? []).map((item) => [item.level, item.redPosition])), [attempt?.reveal]);
  const lastResolvedFloor = attempt?.history.length ? attempt.history[attempt.history.length - 1] : undefined;
  const pendingSafeLevel = attempt?.status === 'IN_PROGRESS'
    && attempt.canClaim
    && lastResolvedFloor?.result === 'SAFE'
    && lastResolvedFloor.level < attempt.level
    ? lastResolvedFloor.level
    : undefined;
  const focusedLevel = attempt ? getTowerFocusedLevel({
    attemptLevel: attempt.level,
    attemptStatus: attempt.status,
    pendingSafeLevel,
  }) : undefined;
  const canUseNextToken = Boolean(
    terminalStatus(attempt?.status) && !attempt?.canClaim && state.availableTokens > 0,
  );
  const canClimb = Boolean(pendingSafeLevel && attempt?.canClaim && runIsOpen && !redCardRevealActive);
  const showActions = canClaim || canClimb || canUseNextToken;
  const showInlineFeedback = Boolean(attempt?.status === 'IN_PROGRESS' || canClaim);

  const finishPendingAction = (action: Exclude<TowerPendingAction, null>) => {
    setPendingAction((current) => current === action ? null : current);
  };

  const refresh = useCallback(async (recoveryAttemptId?: string) => {
    setPendingAction('refresh');
    setError('');
    try {
      const endpoint = recoveryAttemptId
        ? `/api/tower/current?attemptId=${encodeURIComponent(recoveryAttemptId)}`
        : '/api/tower/current';
      const response = await fetch(endpoint, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to refresh Tower.');
      setState(data);
      setResult(null);
      setSelectedCard('');
      scrollReasonRef.current = 'restore';
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh Tower.');
      throw refreshError;
    } finally {
      setPendingAction((current) => current === 'refresh' ? null : current);
    }
  }, []);

  useEffect(() => {
    warningAttemptRef.current = '';
    timeoutAttemptRef.current = '';
    setTimerAnnouncement('');
  }, [activeAttemptId]);

  useEffect(() => () => {
    if (redCardRevealTimerRef.current !== null) {
      window.clearTimeout(redCardRevealTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!attempt || !timedStatus) {
      setClockAnchor(null);
      setRemainingMs(null);
      return;
    }
    const monotonicNow = performance.now();
    const anchor = createTowerClockAnchor(attempt.serverNow, attempt.runExpiresAt, monotonicNow);
    setClockAnchor(anchor);
    setRemainingMs(getTowerRemainingMs(anchor, monotonicNow));
  }, [attempt, timedStatus]);

  useEffect(() => {
    if (!clockAnchor || !activeAttemptId || !timedStatus) return;
    const tick = () => {
      const nextRemaining = getTowerRemainingMs(clockAnchor, performance.now());
      setRemainingMs(nextRemaining);
      if (
        nextRemaining !== null
        && nextRemaining > 0
        && nextRemaining <= TOWER_WARNING_THRESHOLD_MS
        && warningAttemptRef.current !== activeAttemptId
      ) {
        warningAttemptRef.current = activeAttemptId;
        setTimerAnnouncement('One minute left. Take your reward before time ends.');
      }
      if (nextRemaining === 0 && !redCardRevealActive && timeoutAttemptRef.current !== activeAttemptId) {
        timeoutAttemptRef.current = activeAttemptId;
        setTimerAnnouncement('Time is up. This climb is complete.');
        refresh(activeAttemptId).catch(() => undefined);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activeAttemptId, clockAnchor, redCardRevealActive, refresh, timedStatus]);

  useEffect(() => {
    if (!initialSettlingRef.current) return;
    let innerFrame = 0;
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        if (activeAttemptStatus === 'IN_PROGRESS' && focusedLevel) {
          scrollTowerFloor(currentFloorRef.current, 'auto');
        }
        initialSettlingRef.current = false;
        setSettling(false);
      });
    });
    return () => {
      window.cancelAnimationFrame(outerFrame);
      if (innerFrame) window.cancelAnimationFrame(innerFrame);
    };
  }, [activeAttemptId, activeAttemptStatus, focusedLevel]);

  useEffect(() => {
    if (initialSettlingRef.current) return;
    if (!activeAttemptId || activeAttemptStatus !== 'IN_PROGRESS' || !focusedLevel) return;
    const reason = scrollReasonRef.current;
    scrollReasonRef.current = 'restore';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let innerFrame = 0;
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => scrollTowerFloor(
        currentFloorRef.current,
        getTowerScrollBehavior(reason, reducedMotion),
      ));
    });
    return () => {
      window.cancelAnimationFrame(outerFrame);
      if (innerFrame) window.cancelAnimationFrame(innerFrame);
    };
  }, [activeAttemptId, activeAttemptStatus, focusedLevel]);

  useEffect(() => {
    if (claimedTicket || !scrollToTicketsAfterCloseRef.current) return;
    scrollToTicketsAfterCloseRef.current = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let innerFrame = 0;
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        rewardTicketsRef.current?.scrollIntoView({
          block: 'start',
          behavior: reducedMotion ? 'auto' : 'smooth',
        });
        rewardTicketsHeadingRef.current?.focus({ preventScroll: true });
      });
    });
    return () => {
      window.cancelAnimationFrame(outerFrame);
      if (innerFrame) window.cancelAnimationFrame(innerFrame);
    };
  }, [claimedTicket]);

  const closeClaimPopup = (checkTickets = false) => {
    scrollToTicketsAfterCloseRef.current = checkTickets;
    setClaimedTicket(null);
  };

  const start = async () => {
    setPendingAction('start');
    setError('');
    try {
      const response = await fetch('/api/tower/start', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to start Tower.');
      scrollReasonRef.current = 'start';
      setState((current) => ({
        ...current,
        availableTokens: current.attempt?.attemptId === data.attemptId
          ? current.availableTokens
          : Math.max(0, current.availableTokens - 1),
        attempt: data,
      }));
      setResult(null);
      setSelectedCard('');
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Unable to start Tower.');
    } finally {
      finishPendingAction('start');
    }
  };

  const pick = async (cardId: string) => {
    if (!attempt || !canPick) return;
    setPendingAction('pick');
    setError('');
    setSelectedCard(cardId);
    try {
      const response = await fetch('/api/tower/pick', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: attempt.attemptId, cardId }),
      });
      const data: PickResult & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to pick card.');
      const staleSafeReplay = isTowerSafeReplayStale({
        result: data.result,
        requestedLevel: attempt.level,
        latestResolvedLevel: data.attempt.history.at(-1)?.level,
        attemptStatus: data.attempt.status,
        attemptCanClaim: data.attempt.canClaim,
      });
      setResult(staleSafeReplay ? null : data);
      if (staleSafeReplay) setSelectedCard('');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const redCardRevealDelay = staleSafeReplay ? 0 : getTowerRedCardRevealDelay(data.result, reducedMotion);
      if (redCardRevealDelay > 0) {
        if (redCardRevealTimerRef.current !== null) window.clearTimeout(redCardRevealTimerRef.current);
        setRedCardReveal({ cardId });
        redCardRevealTimerRef.current = window.setTimeout(() => {
          setState((current) => current.attempt?.attemptId === data.attempt.attemptId
            ? { ...current, attempt: data.attempt }
            : current);
          setRedCardReveal(null);
          redCardRevealTimerRef.current = null;
        }, redCardRevealDelay);
      } else {
        setState((current) => ({ ...current, attempt: data.attempt }));
      }
    } catch (pickError) {
      setSelectedCard('');
      setError(pickError instanceof Error ? pickError.message : 'Unable to pick card.');
      await refresh(attempt.attemptId).catch(() => undefined);
    } finally {
      finishPendingAction('pick');
    }
  };

  const continueTower = async () => {
    if (!attempt || !pendingSafeLevel || !canClimb) return;
    setPendingAction('climb');
    setError('');
    try {
      const response = await fetch('/api/tower/continue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: attempt.attemptId, level: pendingSafeLevel }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to move to the next floor.');
      scrollReasonRef.current = 'climb';
      setState((current) => ({ ...current, attempt: data.attempt }));
      setResult(null);
      setSelectedCard('');
    } catch (continueError) {
      setError(continueError instanceof Error ? continueError.message : 'Unable to move to the next floor.');
      await refresh(attempt.attemptId).catch(() => undefined);
    } finally {
      finishPendingAction('climb');
    }
  };

  const claim = async () => {
    if (!attempt?.attemptId || !canClaim) return;
    setPendingAction('claim');
    setError('');
    try {
      const response = await fetch('/api/tower/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: attempt.attemptId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to take reward.');
      setResult(null);
      setState((current) => ({
        ...current,
        attempt: data.attempt,
        rewardTickets: data.ticket
          ? [data.ticket, ...(current.rewardTickets ?? []).filter((ticket) => ticket.id !== data.ticket.id)].slice(0, 10)
          : current.rewardTickets,
      }));
      if (data.ticket) setClaimedTicket(data.ticket);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Unable to take reward.');
    } finally {
      finishPendingAction('claim');
    }
  };

  return (
    <main
      className={`tower-page ${settling ? 'settling' : ''} ${showActions ? 'has-actions' : ''} ${attempt?.status === 'IN_PROGRESS' ? 'active-run' : ''}`}
      aria-busy={settling}
    >
      {settling && (
        <div className="tower-settling-loader">
          <div className="tower-settling-shell">
            <div className="loading-state tower-settling-state" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <span>Loading Tower...</span>
            </div>
          </div>
        </div>
      )}

      <section
        className="tower-shell"
        aria-labelledby="tower-title"
        aria-hidden={settling}
        inert={settling}
        style={settling ? { visibility: 'hidden' } : undefined}
      >
        <header className="tower-head">
          <div><span>Booking Check-in Reward</span><h1 id="tower-title"><Castle size={23} /> Tower of Rewards</h1></div>
          <div className="tower-head-actions">
            <button type="button" className="tower-info" onClick={() => setGuideOpen(true)} aria-haspopup="dialog"><Info size={16} /> Info</button>
            <span className="tower-token-count" aria-label={`${state.availableTokens} available Tower Tokens`}><Coins size={15} /> {state.availableTokens}</span>
          </div>
        </header>

        {error && attempt && <div className="alert alert-error tower-alert"><ShieldAlert size={16} /><span>{error}</span><button type="button" onClick={() => refresh(attempt.attemptId).catch(() => undefined)} disabled={loading} aria-label="Retry"><RefreshCw size={15} /></button></div>}
        <p className="sr-only" aria-live="polite">{pendingAnnouncement || announcement}</p>
        <p className="sr-only" aria-live="assertive">{timerAnnouncement}</p>

        {screen === 'loading' ? (
          <div className="loading-state tower-inline-loading" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>Loading Tower...</span>
          </div>
        ) : screen === 'error' ? (
          <EmptyState icon={<ShieldAlert size={34} />} title="Tower could not load" text={error} action={<button className="tower-secondary-button" type="button" onClick={() => refresh().catch(() => undefined)} disabled={loading}><RefreshCw size={16} /> Retry</button>} />
        ) : screen === 'disabled' ? (
          <EmptyState icon={<Castle size={34} />} title="Tower is closed" text="Your tokens stay saved until their deadline." />
        ) : !attempt ? (
          <EmptyState
            icon={<Gift size={34} />}
            title={state.availableTokens ? `${state.availableTokens} Tower Token${state.availableTokens === 1 ? '' : 's'}` : 'No Tower Tokens'}
            text={state.availableTokens && state.nextTokenExpiresAt ? `Next token expires ${formatExpiry(state.nextTokenExpiresAt)}.` : 'Each linked booking check-in adds one token.'}
            action={state.availableTokens ? <button className="tower-main-button" type="button" onClick={start} disabled={loading}><ArrowUp size={17} />{loading ? 'Entering...' : 'Use Tower Token'}</button> : <Link href="/my-bookings" className="btn btn-primary btn-lg"><BookOpen size={18} /> View My Bookings</Link>}
          />
        ) : (
          <>
            {timedStatus && (
              <div className="tower-run-summary">
                <div className="tower-run-copy">
                  <span>{attempt.status === 'IN_PROGRESS' ? pendingSafeLevel ? `Floor ${pendingSafeLevel} cleared` : `Floor ${focusedLevel} of ${attempt.totalLevels}` : 'Tower cleared'}</span>
                  <strong>{rewardLabel(attempt.securedReward)}</strong>
                </div>
                <div className={`tower-countdown ${timerWarning ? 'warning' : ''} ${timerEnded ? 'ended' : ''}`} aria-label={`${formatTowerCountdown(remainingMs)} remaining`}>
                  <span>Time left</span>
                  <strong>{formatTowerCountdown(remainingMs)}</strong>
                </div>
                <small><Clock3 size={13} /> Valid until {formatExpiry(attempt.expiresAt)}</small>
              </div>
            )}
            <div className="tower-emblem" aria-hidden="true"><span className="tower-roof-base" /><Castle size={40} strokeWidth={1.7} /></div>

            <div className="tower-building" aria-label="Tower floors">
              {floors.map((floor) => {
                const history = historyByLevel.get(floor.level);
                const redPosition = revealByLevel.get(floor.level);
                const presentation = getTowerFloorPresentation({
                  level: floor.level,
                  focusedLevel: focusedLevel ?? attempt.level,
                  attemptStatus: attempt.status,
                  historyResult: history?.result,
                  pendingSafeLevel,
                });
                const isFocused = presentation === 'current' || presentation === 'pending-safe';
                const isLocked = presentation === 'locked';
                const showHistoryCards = !isFocused && !isLocked;
                return (
                  <article
                    key={floor.level}
                    ref={isFocused ? (node) => { currentFloorRef.current = node; } : undefined}
                    className={`tower-floor ${presentation}`}
                    aria-current={isFocused ? 'step' : undefined}
                    aria-label={`Floor ${floor.level}, ${rewardLabel(floor.reward)}, ${floorPresentationLabel(presentation)}`}
                  >
                    <div className="floor-label">
                      <b>{floor.level}</b>
                      <span className="floor-reward">{rewardLabel(floor.reward)}</span>
                      <div className="floor-meta">
                        {!showHistoryCards && <FloorMarker presentation={presentation} />}
                        {showHistoryCards && <MiniCards selectedPosition={history?.selectedPosition} result={history?.result} redPosition={redPosition} />}
                      </div>
                    </div>
                    {presentation === 'current' ? (
                      <div className={`active-cards ${isPicking ? 'is-picking' : ''} ${redCardRevealActive ? 'showing-red-card' : ''}`} aria-label={`Floor ${floor.level} cards`} aria-busy={isPicking}>
                        {attempt.cards.map((card, index) => {
                          const redCard = redCardReveal?.cardId === card.id;
                          const pendingCard = isPicking && selectedCard === card.id;
                          return <button
                            key={card.id}
                            type="button"
                            onClick={() => pick(card.id)}
                            disabled={!canPick}
                            className={`${selectedCard === card.id ? 'selected' : ''}${pendingCard ? ' pending-card' : ''}${redCard ? ' red-card-reveal' : ''}`.trim()}
                            aria-busy={pendingCard}
                            aria-label={pendingCard ? `Revealing floor ${floor.level} card ${index + 1}` : redCard ? `Floor ${floor.level} card ${index + 1} was red` : `Choose floor ${floor.level} card ${index + 1}`}
                          >
                            <strong aria-hidden="true">{pendingCard ? <span className="spinner tower-pending-spinner tower-card-spinner" /> : redCard ? <X size={27} /> : '?'}</strong>
                          </button>;
                        })}
                      </div>
                    ) : presentation === 'pending-safe' ? (
                      <DecisionCards floor={floor.level} selectedPosition={history?.selectedPosition} />
                    ) : null}
                    {showInlineFeedback && floor.level === focusedLevel && (
                      <div className="tower-floor-feedback">
                        <div className="tower-message"><span>{announcement}</span></div>
                        {(canClaim || canClimb) && (
                          <div className={`tower-decision-actions ${canClaim && canClimb ? '' : 'single'}`} aria-label="Climb choices">
                            {canClaim && <button className="tower-main-button" type="button" onClick={claim} disabled={loading} aria-busy={isClaiming} aria-label={`Take ${rewardLabel(attempt.securedReward)}`}>{isClaiming ? <><span className="spinner tower-pending-spinner tower-button-spinner" aria-hidden="true" /> Securing...</> : <><Gift size={16} /> Take Reward</>}</button>}
                            {canClimb && <button className="tower-secondary-button" type="button" onClick={continueTower} disabled={loading} aria-busy={isClimbing}>{isClimbing ? <><span className="spinner tower-pending-spinner tower-button-spinner" aria-hidden="true" /> Climbing...</> : <><ArrowUp size={16} /> Next Floor</>}</button>}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {!showInlineFeedback && <div className="tower-message"><span>{announcement}</span></div>}
            {canUseNextToken && (
              <div className="tower-actions">
                <button className="tower-main-button" type="button" onClick={start} disabled={loading}><Coins size={16} /> Use Next Token</button>
              </div>
            )}
          </>
        )}

        {(state.rewardTickets ?? []).length > 0 && (
          <section ref={rewardTicketsRef} id="tower-reward-tickets" className="tower-reward-tickets" aria-labelledby="tower-reward-tickets-title">
            <div className="tower-ticket-heading">
              <Gift size={18} aria-hidden="true" />
              <div><h2 ref={rewardTicketsHeadingRef} id="tower-reward-tickets-title" tabIndex={-1}>Reward Tickets</h2><p>Redeem at the counter before expiry.</p></div>
            </div>
            <div className="tower-ticket-list">
              {(state.rewardTickets ?? []).map((ticket) => (
                <RewardTicketCard key={ticket.id} ticket={getTowerRewardTicketDisplay(ticket)} />
              ))}
            </div>
          </section>
        )}
      </section>

      {guideOpen && <InfoGuideModal eyebrow="Tower Guide" title="How Tower Works" subtitle="Pick. Take. Or risk the climb." titleId="tower-guide-title" steps={GUIDE_STEPS} onClose={() => setGuideOpen(false)} closeLabel="Close Tower guide" />}

      {claimedTicket && (
        <div className="tower-claim-modal-root">
          <AdminModalShell
            onClose={() => closeClaimPopup()}
            labelledBy="tower-claim-title"
            describedBy="tower-claim-description tower-claim-deadline"
          >
            <div className="tower-claim-modal">
              <button type="button" className="tower-claim-close" onClick={() => closeClaimPopup()} aria-label="Close reward confirmation">
                <X size={17} aria-hidden="true" />
              </button>
              <span className="tower-claim-icon" aria-hidden="true"><Trophy size={28} /></span>
              <h2 id="tower-claim-title">Congratulations!</h2>
              <p id="tower-claim-description">You won <strong>{rewardLabel(claimedTicket.reward)}</strong>.</p>
              <p id="tower-claim-deadline" className="tower-claim-deadline"><Clock3 size={15} aria-hidden="true" /> Redeem by <strong>{formatExpiry(claimedTicket.expiresAt)}</strong></p>
              <button type="button" className="tower-main-button tower-check-tickets" onClick={() => closeClaimPopup(true)}>
                <Gift size={17} aria-hidden="true" /> Check Tickets
              </button>
            </div>
          </AdminModalShell>
        </div>
      )}

      <style jsx>{`
        .tower-page { --tower-current-accent: #a78bfa; --tower-current-bg: #19162b; --tower-structure: #3b6d77; --tower-roof-width: 140px; min-height: calc(100dvh - 124px); overflow-x: clip; padding: 12px 10px 36px; background: #080d16; color: var(--color-text-primary); }
        .tower-page.has-actions { padding-bottom: 112px; }
        .tower-page.active-run { padding-bottom: max(256px, calc(50dvh + 26px)); }
        .tower-page.active-run.has-actions { padding-bottom: max(332px, calc(50dvh + 102px)); }
        .tower-settling-loader { position: fixed; z-index: 20; inset: 124px 0 0; padding: 12px 10px 36px; background: #080d16; }
        .tower-settling-shell { width: min(100%, 480px); height: 100%; display: grid; place-items: center; margin: 0 auto; }
        .tower-settling-state { min-height: 0; padding: 24px; }
        .tower-inline-loading { min-height: 330px; padding: 24px; }
        .tower-shell { width: min(100%, 480px); display: grid; gap: 10px; margin: 0 auto; }
        .tower-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 3px 2px; }
        .tower-head > div:first-child { min-width: 0; }
        .tower-head > div:first-child > span { color: #69d9e7; font-size: .62rem; font-weight: 800; text-transform: uppercase; }
        .tower-head h1 { display: flex; align-items: center; gap: 7px; margin: 3px 0 0; font-size: 1.14rem; line-height: 1.2; }
        .tower-head-actions { display: flex; align-items: center; gap: 6px; }
        .tower-info, .tower-token-count { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid #2b394c; border-radius: 6px; padding: 0 8px; background: #101827; color: var(--color-text-secondary); font: inherit; font-size: .7rem; font-weight: 800; }
        .tower-info { border-color: rgba(97,232,255,0.3); background: #111b2a; color: #61e8ff; cursor: pointer; }
        .tower-info:focus-visible { outline: 2px solid #61e8ff; outline-offset: 2px; }
        .tower-token-count { min-width: 45px; }
        .tower-emblem { position: relative; height: 76px; display: grid; place-items: center; margin-block: -2px; color: #61e8ff; }
        .tower-emblem::before, .tower-emblem::after { content: ''; position: absolute; z-index: 0; top: 2px; width: 100px; height: 1px; background: var(--tower-structure); }
        .tower-emblem::before { right: 50%; transform: rotate(-46deg); transform-origin: right center; }
        .tower-emblem::after { left: 50%; transform: rotate(46deg); transform-origin: left center; }
        .tower-emblem > svg { position: absolute; z-index: 2; top: 30px; background: #080d16; }
        .tower-roof-base { position: absolute; z-index: 1; bottom: 1px; left: 50%; width: var(--tower-roof-width); height: 1px; background: var(--tower-structure); transform: translateX(-50%); }
        .tower-alert { margin: 0; }
        .tower-alert span { min-width: 0; flex: 1; }
        .tower-alert button { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid currentColor; border-radius: 6px; background: transparent; color: inherit; }
        .tower-run-summary { position: sticky; top: 72px; z-index: 8; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 5px 10px; padding: 8px 10px; border-bottom: 1px solid #35445a; background: #0b1421; }
        .tower-run-copy { min-width: 0; display: grid; align-content: center; gap: 2px; }
        .tower-run-copy > span { color: #73dbe8; font-size: .65rem; font-weight: 800; text-transform: uppercase; }
        .tower-run-copy > strong { min-width: 0; color: #d7e0eb; font-size: .74rem; overflow-wrap: anywhere; }
        .tower-countdown { min-width: 68px; display: grid; justify-items: end; align-content: center; padding-left: 9px; border-left: 1px solid #263348; }
        .tower-countdown span { color: var(--color-text-muted); font-size: .6rem; font-weight: 750; text-transform: uppercase; }
        .tower-countdown strong { color: #8ee8ff; font-variant-numeric: tabular-nums; font-size: 1.12rem; line-height: 1.1; }
        .tower-countdown.warning strong { color: #f4d66b; }
        .tower-countdown.ended strong { color: #f5a0aa; }
        .tower-run-summary small { grid-column: 1 / -1; display: inline-flex; align-items: center; gap: 5px; color: var(--color-text-muted); font-size: .68rem; }
        .tower-building { position: relative; isolation: isolate; display: grid; gap: 4px; padding-left: 6px; }
        .tower-building::before { content: ''; position: absolute; z-index: 0; top: -11px; bottom: 0; left: 50%; width: var(--tower-roof-width); border-right: 1px solid var(--tower-structure); border-left: 1px solid var(--tower-structure); box-sizing: border-box; transform: translateX(-50%); }
        .tower-floor { position: relative; z-index: 1; width: 100%; min-width: 0; min-height: 45px; display: grid; align-content: center; gap: 8px; padding: 5px 8px; border: 1px solid #34475d; border-radius: 4px; background: #101a27; }
        .tower-floor.locked { border-color: #30465e; color: #8393a8; background: #0e1825; }
        .tower-floor.current, .tower-floor.pending-safe { scroll-margin-block: 150px 128px; gap: 9px; padding: 9px; border: 2px solid var(--tower-current-accent); background: var(--tower-current-bg); }
        .tower-floor.pending-safe { border-color: #48bc7f; background: #10231b; }
        .tower-floor.cleared { border-color: #3f8d67; background: #10251b; }
        .tower-floor.lost { border-color: #a54a59; background: #28151b; }
        .tower-floor.revealed { border-color: #38516b; background: #101c29; }
        .floor-label { min-width: 0; display: grid; grid-template-columns: 34px minmax(0,1fr) auto; align-items: center; gap: 7px; }
        .floor-label > b { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid #5edbe9; border-radius: 4px; background: #080b10; color: #bad9ed; font-size: .78rem; line-height: 1; }
        .tower-floor.current .floor-label > b { border-color: var(--tower-current-accent); color: #ede9fe; }
        .tower-floor.pending-safe .floor-label > b, .tower-floor.cleared .floor-label > b { background: #17613f; color: #d0f8e1; }
        .tower-floor.lost .floor-label > b { background: #571f2a; color: #ffd0d5; }
        .tower-floor.locked .floor-label > b, .tower-floor.revealed .floor-label > b { color: #bad9ed; }
        .floor-reward { min-width: 0; color: #8ee8f2; font-size: .69rem; font-weight: 700; line-height: 1.2; overflow: hidden; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .tower-floor.locked .floor-reward { color: #78cbd5; -webkit-line-clamp: 1; }
        .floor-meta { min-width: 26px; display: flex; align-items: center; justify-content: flex-end; gap: 5px; }
        :global(.floor-state) { width: 26px; height: 26px; display: inline-grid; place-items: center; color: #7e899b; }
        :global(.floor-state.current) { color: var(--tower-current-accent); }
        :global(.floor-state.pending) { color: #79d6a5; }
        .active-cards, :global(.decision-cards) { min-height: 108px; display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 7px; }
        .active-cards button, :global(.decision-card) { min-width: 0; min-height: 108px; display: grid; place-items: center; border: 1px solid #466078; border-radius: 6px; background: #182638; color: #eaf3f6; }
        .active-cards button { font: inherit; cursor: pointer; transition: transform 100ms ease, opacity 100ms ease; }
        .active-cards button strong, :global(.decision-card strong) { display: grid; place-items: center; color: #d8e8ed; font-size: 1.55rem; line-height: 1; }
        .active-cards button:not(:disabled):focus-visible, .active-cards button:not(:disabled):hover { outline: 2px solid var(--tower-current-accent); outline-offset: 2px; }
        .active-cards button.selected { transform: translateY(2px); border-color: var(--tower-current-accent); background: #211a38; }
        .active-cards button:disabled { cursor: default; opacity: .72; }
        .active-cards.is-picking button:not(.pending-card) { opacity: .32; }
        .active-cards button.pending-card { border-color: var(--tower-current-accent); background: #211a38; opacity: 1; }
        .active-cards.showing-red-card button:not(.red-card-reveal) { opacity: .32; }
        .active-cards button.red-card-reveal { border-color: #e55d6d; background: #681f2c; opacity: 1; animation: towerRedCardPulse ${TOWER_RED_CARD_REVEAL_MS}ms ease-out forwards; }
        .active-cards button.red-card-reveal strong { color: #ffd9de; }
        .tower-pending-spinner { flex: 0 0 auto; width: 16px; height: 16px; border-width: 2px; border-color: rgba(217,231,239,.25); border-top-color: currentColor; }
        .tower-card-spinner { width: 25px; height: 25px; border-color: rgba(221,214,254,.22); border-top-color: #ddd6fe; }
        .tower-main-button .tower-button-spinner { border-color: rgba(6,33,22,.25); border-top-color: #062116; }
        .tower-secondary-button .tower-button-spinner { border-color: rgba(217,231,239,.22); border-top-color: #d9e7ef; }
        :global(.decision-card) { border-color: #345a48; background: #14251d; color: #759083; }
        :global(.decision-card.selected) { border-color: #4ac488; background: #17452f; color: #b7efcf; animation: towerSafeCardPulse ${TOWER_SAFE_CARD_PULSE_MS}ms ease-out forwards; }
        :global(.decision-card.selected strong) { color: #b7efcf; }
        :global(.tower-mini-cards) { display: grid; grid-template-columns: repeat(3, 18px); justify-content: end; gap: 3px; }
        :global(.tower-mini-card) { width: 18px; height: 14px; display: grid; place-items: center; border: 1px solid #39475b; border-radius: 2px; background: #182231; color: #718096; }
        :global(.tower-mini-cards.terminal-reveal) { grid-template-columns: repeat(3, 28px); gap: 4px; }
        :global(.tower-mini-cards.terminal-reveal .tower-mini-card) { width: 28px; height: 22px; }
        :global(.tower-mini-card.safe) { border-color: #49ad79; background: #17613f; color: #d0f8e1; }
        :global(.tower-mini-card.selected-safe) { border-color: #86efac; background: #238653; color: #ecfdf5; }
        :global(.tower-mini-card.red) { border-color: #aa4c5a; background: #571f2a; color: #ffd0d5; }
        .tower-floor-feedback { display: grid; gap: 7px; }
        .tower-message { min-height: 40px; display: flex; align-items: center; padding: 8px 10px; border-left: 3px solid var(--tower-current-accent); background: #211a38; color: #ddd6fe; font-size: .78rem; font-weight: 700; }
        .tower-reward-tickets { display: grid; gap: 9px; padding-top: 4px; scroll-margin-top: 88px; }
        .tower-ticket-heading { display: flex; align-items: center; gap: 8px; color: #8edee8; }
        .tower-ticket-heading div { min-width: 0; }
        .tower-ticket-heading h2, .tower-ticket-heading p { margin: 0; }
        .tower-ticket-heading h2 { color: var(--color-text-primary); font-size: .9rem; }
        .tower-ticket-heading p { margin-top: 2px; color: var(--color-text-muted); font-size: .69rem; }
        .tower-ticket-list { display: grid; gap: 8px; }
        .tower-decision-actions { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px; padding: 7px; border: 1px solid #35445a; border-radius: 7px; background: #080f19; }
        .tower-decision-actions.single { grid-template-columns: minmax(0,1fr); }
        .tower-actions { position: relative; z-index: 2; width: 100%; display: grid; gap: 6px; padding: 7px; border: 1px solid #35445a; border-radius: 7px; background: #080f19; }
        .tower-main-button, .tower-secondary-button { min-width: 0; min-height: 46px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 6px; padding: 8px 12px; font: inherit; font-size: .81rem; font-weight: 800; text-align: center; text-decoration: none; cursor: pointer; overflow-wrap: anywhere; }
        .tower-main-button { border: 1px solid #61d9e7; background: #61d9e7; color: #061018; }
        .tower-secondary-button { border: 1px solid #40516a; background: #151f2e; color: var(--color-text-primary); }
        .tower-actions .tower-main-button, .tower-decision-actions .tower-main-button { border-color: #4bc487; background: #4bc487; color: #062116; }
        .tower-decision-actions .tower-secondary-button { border-color: #4a647d; background: #152233; color: #d9e7ef; }
        .tower-main-button:disabled, .tower-secondary-button:disabled { opacity: .55; cursor: default; }
        .tower-claim-modal-root { display: contents; }
        .tower-claim-modal-root > :global(.admin-modal-overlay) { padding: 12px; background: rgba(2,6,12,.84); backdrop-filter: none; -webkit-backdrop-filter: none; }
        .tower-claim-modal-root > :global(.admin-modal-overlay) > :global(.admin-modal-dialog) { width: min(100%,340px); max-width: 340px; padding: 0; border: 1px solid #7561a8; border-radius: 8px; background: #0e1420; animation: none; overflow: hidden; }
        .tower-claim-modal { position: relative; display: grid; justify-items: center; gap: 10px; padding: 24px 18px 18px; text-align: center; }
        .tower-claim-close { position: absolute; top: 8px; right: 8px; width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid #364258; border-radius: 6px; background: #111a28; color: #b8c3d2; cursor: pointer; }
        .tower-claim-close:focus-visible, .tower-check-tickets:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
        .tower-claim-icon { width: 48px; height: 48px; display: grid; place-items: center; border: 1px solid #7561a8; border-radius: 50%; background: #211a38; color: #c4b5fd; }
        .tower-claim-modal h2, .tower-claim-modal p { margin: 0; }
        .tower-claim-modal h2 { color: #f2efff; font-size: 1.08rem; }
        .tower-claim-modal > p { color: #cbd5e1; font-size: .84rem; line-height: 1.45; }
        .tower-claim-modal > p strong { color: #f4f1ff; }
        .tower-claim-deadline { width: 100%; min-width: 0; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px; padding: 9px; border: 1px solid #2b3b50; border-radius: 6px; background: #111b2a; overflow-wrap: anywhere; }
        .tower-check-tickets { width: 100%; min-height: 48px; border-color: #a78bfa; background: #a78bfa; color: #130f20; }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        @keyframes towerRedCardPulse {
          0%, 100% { transform: scale(1); }
          22% { transform: scale(.97); }
          48% { transform: scale(1.02); }
          72% { transform: scale(.99); }
        }
        @keyframes towerSafeCardPulse {
          0%, 100% { transform: scale(1); }
          30% { transform: scale(.98); }
          58% { transform: scale(1.015); }
          80% { transform: scale(.995); }
        }
        @media (max-width: 340px) {
          .tower-page { padding-inline: 7px; }
          .tower-head h1 { font-size: 1.04rem; }
          .tower-info, .tower-token-count { padding-inline: 6px; }
          .tower-floor.current, .tower-floor.pending-safe { padding-inline: 7px; }
          .active-cards, :global(.decision-cards) { min-height: 96px; gap: 6px; }
          .active-cards button, :global(.decision-card) { min-height: 96px; }
        }
        @media (min-width: 390px) {
          .active-cards, :global(.decision-cards) { min-height: 112px; }
          .active-cards button, :global(.decision-card) { min-height: 112px; }
        }
        @media (min-width: 520px) { .tower-page { padding-top: 18px; } .tower-ticket-list { grid-template-columns: repeat(2,minmax(0,1fr)); } }
        @media (prefers-reduced-motion: reduce) {
          .active-cards button { transition: none; }
          .active-cards button.red-card-reveal { animation: none; }
          :global(.decision-card.selected) { animation: none; }
          .tower-pending-spinner { animation: none; }
        }
      `}</style>
    </main>
  );
}

function terminalStatus(status: TowerAttemptState['status'] | undefined) {
  return status === 'LOST' || status === 'CLAIMED' || status === 'TIMED_OUT' || status === 'EXPIRED';
}

function floorPresentationLabel(presentation: TowerFloorPresentation) {
  if (presentation === 'current') return 'current floor';
  if (presentation === 'pending-safe') return 'cleared, awaiting your decision';
  if (presentation === 'cleared') return 'cleared';
  if (presentation === 'lost') return 'red card';
  if (presentation === 'revealed') return 'revealed';
  return 'locked';
}

function FloorMarker({ presentation }: { presentation: TowerFloorPresentation }) {
  if (presentation === 'current') return <span className="floor-state current" aria-label="Current floor" title="Current floor"><ArrowUp size={16} aria-hidden="true" /></span>;
  if (presentation === 'pending-safe') return <span className="floor-state pending" aria-label="Cleared" title="Cleared"><Check size={16} aria-hidden="true" /></span>;
  return <span className="floor-state locked" aria-label="Locked" title="Locked"><LockKeyhole size={14} aria-hidden="true" /></span>;
}

function DecisionCards({ floor, selectedPosition }: { floor: number; selectedPosition?: number }) {
  return <div className="decision-cards" aria-label={`Floor ${floor} cleared cards`}>{[0, 1, 2].map((position) => {
    const selected = selectedPosition === position;
    return <span key={position} role="img" className={selected ? 'decision-card selected' : 'decision-card'} aria-label={selected ? `Card ${position + 1} was safe` : `Card ${position + 1}`}>
      <strong aria-hidden="true">{selected ? <Zap size={27} /> : '?'}</strong>
    </span>;
  })}</div>;
}

function MiniCards({ selectedPosition, result, redPosition }: {
  selectedPosition?: number;
  result?: 'SAFE' | 'LOSS';
  redPosition?: number;
}) {
  const terminalReveal = redPosition !== undefined;
  const selectedSafe = result === 'SAFE' && selectedPosition !== undefined;
  const historyLabel = terminalReveal
    ? selectedSafe
      ? `You selected card ${selectedPosition + 1} safely. Red card was position ${redPosition + 1}.`
      : result === 'LOSS' && selectedPosition !== undefined
        ? `You selected red card ${selectedPosition + 1}.`
        : `Red card was position ${redPosition + 1}.`
    : selectedSafe
      ? `You selected card ${selectedPosition + 1} safely.`
      : undefined;
  return <div className={`tower-mini-cards ${terminalReveal ? 'terminal-reveal' : ''}`} role={historyLabel ? 'img' : undefined} aria-label={historyLabel}>{[0, 1, 2].map((position) => {
    const cardPresentation = getTowerMiniCardPresentation({ position, selectedPosition, historyResult: result, redPosition });
    const red = cardPresentation === 'red';
    const safe = cardPresentation === 'safe';
    const chosenSafe = cardPresentation === 'selected-safe';
    const iconSize = terminalReveal ? 12 : 9;
    return <span key={position} aria-hidden="true" className={`tower-mini-card ${red ? 'red' : chosenSafe ? 'selected-safe' : safe ? 'safe' : ''}`}>{red ? <X size={iconSize} /> : chosenSafe ? <Zap size={iconSize} /> : safe ? <Check size={iconSize} /> : null}</span>;
  })}</div>;
}

function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return <div className="tower-empty">{icon}<h2>{title}</h2>{text && <p>{text}</p>}{action}<style jsx>{`
    .tower-empty { min-height: 330px; display: grid; place-items: center; align-content: center; gap: 11px; padding: 20px; border: 1px solid #202c3e; border-radius: 8px; background: #0d1421; text-align: center; color: var(--color-text-secondary); }
    .tower-empty h2, .tower-empty p { margin: 0; }
    .tower-empty h2 { color: var(--color-text-primary); font-size: 1rem; }
    .tower-empty p { max-width: 280px; font-size: .84rem; line-height: 1.5; }
  `}</style></div>;
}
