'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { applyMineAction, mineClock, mineNow, minePhase, mineSeconds, nextMineBoundary, olderMineResult, hasMineAttempt, skipMineEntry, readMineStart, mineStartKey } from '@/lib/guess-36-client';
import type { MineActionResponse, MineRun, MineState } from '@/lib/guess-36-mines-rules';
import { useCompleteGuess36Entry } from './Guess36LoadingBoundary';

type Refresh = { view?: 'board' | 'recover' | 'current'; id?: string; reason?: 'entry' | 'manual' | 'resume' | 'deadline' | 'boundary' };
type Pending = number | 'collect' | 'refresh' | null;
class MineRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

async function request<T>(url: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new MineRequestError(value.error || 'Could not confirm your result.', response.status, value.code);
  return value;
}

export function useGuess36Run(initialState?: MineState, initialError?: string) {
  const { data: session, status: sessionStatus } = useSession();
  const account = useRef(session?.user?.id ?? null);
  const completeEntry = useCompleteGuess36Entry();
  const [state, setState] = useState(initialState);
  const [error, setError] = useState(initialError ?? '');
  const [pending, setPending] = useState<Pending>(null);
  const [armed, setArmed] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const clock = useRef(mineClock(initialState?.serverNow ?? new Date().toISOString(), performance.now()));
  const [now, setNow] = useState(clock.current.serverMs);
  const current = useRef(initialState);
  const boardView = useRef(false);
  const prepared = useRef(false);
  const [retryStart, setRetryStart] = useState(false);
  const mounted = useRef(true);
  const gate = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const queued = useRef<Refresh | null>(null);
  const refreshRef = useRef<(options?: Refresh) => Promise<void>>(async () => {});
  const expired = useRef<string | null>(null);
  const warned = useRef<string | null>(null);
  const boundaryAttempt = useRef<number | null>(null);

  const install = useCallback((next: MineState, board = false) => {
    if (olderMineResult(current.current, next)) return false;
    if (prepared.current && !board && next.run?.status !== 'ACTIVE' && next.enabled && hasMineAttempt(next)) next = { ...next, run: null };
    current.current = next;
    boardView.current = board;
    clock.current = mineClock(next.serverNow, performance.now());
    setNow(clock.current.serverMs);
    setState(next); setInspecting(board); setUncertain(false); setError('');
    if (skipMineEntry(next) || !next.authenticated) completeEntry();
    setArmed(previous => previous && next.authenticated && next.enabled && hasMineAttempt(next) && !next.run);
    if (next.run?.status === 'ACTIVE' && Date.parse(next.run.expiresAt) > clock.current.serverMs) expired.current = null;
    return true;
  }, [completeEntry]);

  const clearSession = useCallback(() => {
    prepared.current = false; setRetryStart(false);
    const previous = current.current;
    if (previous) install({ ...previous, authenticated: false, recoveryKey: null, run: null, rewardTickets: [], legacyUsedToday: false,
      eligibility: { ...previous.eligibility, freeAvailable: false, bonuses: [], review: { ...previous.eligibility.review, claimed: false } },
      serverNow: new Date(mineNow(clock.current, performance.now())).toISOString() });
  }, [install]);

  const finish = useCallback((sequence: number) => {
    if (!mounted.current || sequence !== generation.current) return;
    gate.current = false; controller.current = null; setPending(null);
    const waiting = queued.current; queued.current = null;
    if (waiting) queueMicrotask(() => { if (mounted.current) void refreshRef.current(waiting); });
  }, []);

  const refresh = useCallback(async (options: Refresh = {}) => {
    if (!mounted.current) return;
    if (options.reason === 'deadline' && current.current?.run?.status !== 'ACTIVE') return;
    if (gate.current) { queued.current ??= options; return; }
    gate.current = true; setPending('refresh'); setAnnouncement('');
    const sequence = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 20_000);
    const query = new URLSearchParams();
    const selected = options.id ?? current.current?.run?.id;
    const board = options.view === 'board' || (!options.view && boardView.current);
    if (selected && options.view !== 'current') query.set(board ? 'inspect' : 'recover', selected);
    try {
      const saved = current.current?.authenticated ? readMineStart(current.current) : null;
      if (saved) { query.delete('inspect'); query.delete('recover'); query.set('startRequest', saved.requestId); setUncertain(true); setRetryStart(true); }
      const next = await request<MineState>(`/api/guess-36/current${query.size ? `?${query}` : ''}`, abort.signal);
      if (mounted.current && sequence === generation.current) {
        const accountStart = !saved && next.authenticated ? readMineStart(next) : null;
        if (saved && next.run) { const key = mineStartKey(current.current!); if (key) localStorage.removeItem(key); setRetryStart(false); }
        install(next, board && !saved);
        if (accountStart) {
          // An account restored after sign-in may have its own interrupted start.
          // Reconcile it before enabling picks; never replay the transaction.
          setUncertain(true); setRetryStart(true); queued.current = { reason: 'entry' };
        }
      }
    } catch (cause) {
      if (mounted.current && sequence === generation.current) {
        if (cause instanceof MineRequestError && (cause.status === 401 || cause.code === 'FORBIDDEN')) clearSession();
        setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Connection slow. Check result to continue.');
      }
    } finally { clearTimeout(timeout); finish(sequence); }
  }, [install, finish, clearSession]);

  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useLayoutEffect(() => {
    if (sessionStatus === 'loading') return;
    const next = sessionStatus === 'authenticated' ? session?.user?.id ?? null : null;
    if (next === account.current) return;
    account.current = next;
    // Invalidate old-account responses before they can install private state.
    generation.current++; controller.current?.abort(); controller.current = null;
    gate.current = false; queued.current = null; boardView.current = false;
    expired.current = null; warned.current = null; boundaryAttempt.current = null;
    setPending(null); setUncertain(false); setInspecting(false); setAnnouncement('');
    clearSession();
    if (next) void refreshRef.current({ view: 'current', reason: 'entry' });
  }, [sessionStatus, session?.user?.id, clearSession]);
  useEffect(() => {
    mounted.current = true;
    if (initialError || (current.current && skipMineEntry(current.current))) completeEntry();
    const invalidate = () => { generation.current++; };
    let resume: ReturnType<typeof setTimeout> | undefined;
    // App Router Back can restore old server props after a pending request.
    // Verify once on entry, retaining content and never repeating a mutation.
    if (current.current?.authenticated) { try { if (readMineStart(current.current)) { completeEntry(); setUncertain(true); setRetryStart(true); } } catch { completeEntry(); setUncertain(true); setError('Saved first reveal could not be read. Check result before continuing.'); } }
    if (current.current?.authenticated) resume = setTimeout(() => void refreshRef.current({ reason: 'entry' }), 0);
    let hidden = document.hidden;
    const onVisibility = () => {
      const returning = hidden && !document.hidden; hidden = document.hidden;
      if (returning) {
        setNow(mineNow(clock.current, performance.now()));
        clearTimeout(resume);
        resume = setTimeout(() => void refreshRef.current({ reason: 'resume' }), 100);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted.current = false; invalidate(); gate.current = false; queued.current = null;
      clearTimeout(resume); controller.current?.abort(); controller.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [completeEntry, initialError]);

  const run = state?.run;
  useEffect(() => {
    if (run?.status !== 'ACTIVE') return;
    const tick = () => {
      const instant = mineNow(clock.current, performance.now()); setNow(instant);
      const left = mineSeconds(run, instant);
      if (left > 0 && left <= 15 && warned.current !== run.id) {
        warned.current = run.id; setAnnouncement('15 seconds or less remaining. Collect to secure your reward.');
      }
      if (!left && expired.current !== run.id) {
        expired.current = run.id; void refreshRef.current({ reason: 'deadline' });
      }
    };
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [run]);

  useEffect(() => {
    if (!state?.authenticated) return;
    const instant = mineNow(clock.current, performance.now());
    const boundary = nextMineBoundary(state, instant);
    if (!Number.isFinite(boundary) || boundaryAttempt.current === boundary) return;
    const timer = setTimeout(() => {
      setNow(mineNow(clock.current, performance.now()));
      if (!document.hidden) { boundaryAttempt.current = boundary; void refreshRef.current({ reason: 'boundary' }); }
    }, Math.max(0, boundary - instant) + 25);
    return () => clearTimeout(timer);
  }, [state]);

  // Resolves with the server-confirmed run only when this action installed it,
  // so presentation feedback never replays on refresh or recovery.
  const act = async (index?: number, retry = false): Promise<MineRun | null> => {
    const previous = current.current;
    if (!previous?.authenticated || gate.current || (uncertain && !retry) || boardView.current) return null;
    if (index === undefined && previous.run?.status !== 'ACTIVE') return null;
    prepared.current = false; setArmed(false);
    gate.current = true; setPending(index ?? 'collect'); setError(''); setAnnouncement('');
    const sequence = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 20_000);
    try {
      // A first-pick retry always uses its saved request ID, even if another
      // device's active board has since been restored. It must not add a pick.
      const activeRun = !retry && previous.run?.status === 'ACTIVE' ? previous.run : null;
      let start = !activeRun ? readMineStart(previous) : null;
      if (!activeRun && index !== undefined && !start) {
        const key = mineStartKey(previous);
        if (!key) throw new Error('Refresh your account before starting.');
        start = { requestId: crypto.randomUUID(), date: previous.date, index };
        localStorage.setItem(key, JSON.stringify(start));
      }
      const result = await request<MineActionResponse>(`/api/guess-36/${index === undefined ? 'collect' : 'reveal'}`, abort.signal,
        index === undefined ? { runId: activeRun!.id, version: activeRun!.version }
          : activeRun ? { date: activeRun.date, index, runId: activeRun.id, version: activeRun.version } : start);
      if (!mounted.current || sequence !== generation.current) return null;
      prepared.current = false;
      if (!install(applyMineAction(previous, result))) return null;
      if (start) { const key = mineStartKey(previous); if (key) localStorage.removeItem(key); setRetryStart(false); }
      const tile = result.run.tiles.find(value => value.index === index);
      setAnnouncement(result.run.status === 'LOST' ? 'Run ended. Uncollected reward lost.' : result.run.status !== 'ACTIVE'
        ? result.run.reward ? `${result.run.reward.name} secured. Added to Reward Tickets.` : 'Run finished. No reward.'
        : tile?.color === 'GREEN' ? `Uncollected reward: ${result.run.reward?.name}. Collect to keep it.` : tile ? 'Clear. Choose another tile.' : 'Your active expedition was restored. Continue on this board.');
      return result.run;
    } catch (cause) {
      if (mounted.current && sequence === generation.current) {
        if (cause instanceof MineRequestError && (cause.status === 401 || cause.code === 'FORBIDDEN')) clearSession();
        else {
          if ((retry || previous.run?.status !== 'ACTIVE') && cause instanceof MineRequestError && cause.status < 500 && cause.code !== 'REQUEST_CONFLICT') {
            try { const key = mineStartKey(previous); if (key) localStorage.removeItem(key); } catch { /* Preserve recovery when storage is unavailable. */ }
          }
          setUncertain(true); try { setRetryStart(!!readMineStart(previous)); } catch { /* Keep uncertain state. */ }
        }
        setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Response interrupted. Check result before continuing.');
      }
      return null;
    } finally { clearTimeout(timeout); finish(sequence); }
  };

  const retryFirstAction = () => {
    try {
      const saved = current.current && readMineStart(current.current);
      if (saved) void act(saved.index, true);
      else { setRetryStart(false); void refresh(); }
    } catch {
      setUncertain(true); setError('Saved first reveal could not be read. Check result before continuing.');
    }
  };

  return {
    state, error, pending, busy: pending !== null, armed, uncertain, inspecting, announcement,
    seconds: mineSeconds(run, now), now, phase: minePhase(state),
    retryFirst: retryStart ? retryFirstAction : undefined,
    play: () => { const value = current.current; if (!value || uncertain || gate.current || !value.enabled || !hasMineAttempt(value) || value.run?.status === 'ACTIVE') return; prepared.current = true; boardView.current = false; install({ ...value, run: null }); setArmed(true); }, act, refresh,
  };
}
