import type { MineActionResponse, MineRun, MineState } from './guess-36-mines-rules';

export type MinePhase = 'SIGN_IN' | 'READY' | 'PLAYING' | 'SECURED' | 'LOST' | 'TIMED_OUT' | 'PAUSED' | 'USED';
export type MineClock = { serverMs: number; monotonicMs: number };

export function mineClock(serverNow: string, monotonicMs: number): MineClock {
  return { serverMs: Date.parse(serverNow), monotonicMs };
}

export function mineNow(clock: MineClock, monotonicMs: number) {
  return clock.serverMs + Math.max(0, monotonicMs - clock.monotonicMs);
}

export function mineSeconds(run: MineRun | null | undefined, now: number) {
  return run?.status === 'ACTIVE' ? Math.max(0, Math.ceil((Date.parse(run.expiresAt) - now) / 1000)) : 90;
}

export function minePhase(state: MineState | undefined): MinePhase {
  if (!state?.authenticated) return 'SIGN_IN';
  if (state.run) {
    if (state.run.status === 'ACTIVE') return 'PLAYING';
    if (state.run.status === 'LOST') return 'LOST';
    if (state.run.status === 'TIMED_OUT') return 'TIMED_OUT';
    return 'SECURED';
  }
  if (state.legacyUsedToday && !hasMineAttempt(state)) return 'USED';
  return state.enabled ? 'READY' : 'PAUSED';
}

export function olderMineResult(current: MineState | undefined, next: MineState) {
  return !!current?.run && current.run.id === next.run?.id && current.run.version > next.run.version;
}

export function availableMineTickets(state: MineState, now: number) {
  const tickets = new Map(state.rewardTickets.filter(ticket => Date.parse(ticket.expiresAt) > now).map(ticket => [ticket.id, ticket]));
  const run = state.run;
  if (run?.ticket) {
    tickets.delete(run.ticket.id);
    if (run.reward && run.ticket.status === 'UNUSED' && Date.parse(run.ticket.expiresAt) > now) {
      return [{ id: run.ticket.id, expiresAt: run.ticket.expiresAt, reward: run.reward }, ...tickets.values()];
    }
  }
  return [...tickets.values()];
}

export function applyMineAction(state: MineState, result: MineActionResponse): MineState {
  const next = { ...state, run: result.run, serverNow: result.serverNow, eligibility: result.eligibility ?? state.eligibility, date: result.eligibility?.review.date ?? state.date, nextDayAt: result.eligibility?.review.nextResetAt ?? state.nextDayAt };
  return { ...next, rewardTickets: availableMineTickets(next, Date.parse(result.serverNow)) };
}

export function nextMineBoundary(state: MineState, now: number) {
  return Math.min(Date.parse(state.nextDayAt), ...availableMineTickets(state, now).map(ticket => Date.parse(ticket.expiresAt)), ...(state.eligibility?.bonuses ?? []).map(bonus => Date.parse(bonus.expiresAt)));
}

export function hasMineAttempt(state: MineState) {
  return state.eligibility ? state.eligibility.freeAvailable || state.eligibility.bonuses.length > 0 : !state.legacyUsedToday && !state.run;
}
export function skipMineEntry(state: MineState) {
  return !!state.run || state.legacyUsedToday || !state.enabled || (state.authenticated && !hasMineAttempt(state));
}
export type PendingMineStart = { requestId: string; date: string; index: number };
export function mineStartKey(state: MineState) { return state.recoveryKey ? `emiguild:guess36:${state.recoveryKey}:start` : null; }
export function readMineStart(state: MineState): PendingMineStart | null {
  const key = mineStartKey(state);
  if (!key) return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw) as PendingMineStart;
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(value.requestId) || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !Number.isInteger(value.index) || value.index < 0 || value.index > 35) throw new Error('Saved first reveal could not be read. Check your result before starting again.');
  return value;
}
