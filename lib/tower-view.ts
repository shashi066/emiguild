export type TowerScreen = 'error' | 'loading' | 'disabled' | 'no-ticket' | 'ready' | 'active' | 'lost' | 'completed' | 'claimed' | 'timed-out' | 'expired';
export type TowerFloorPresentation = 'locked' | 'current' | 'pending-safe' | 'cleared' | 'lost' | 'revealed';
export type TowerMiniCardPresentation = 'neutral' | 'safe' | 'selected-safe' | 'red';
export type TowerScrollReason = 'restore' | 'start' | 'climb';

export const TOWER_RED_CARD_REVEAL_MS = 1200;

export function getTowerRedCardRevealDelay(result: 'SAFE' | 'LOSS', reducedMotion: boolean) {
  return result === 'LOSS' && !reducedMotion ? TOWER_RED_CARD_REVEAL_MS : 0;
}

export function isTowerSafeReplayStale(input: {
  result: 'SAFE' | 'LOSS';
  requestedLevel: number;
  latestResolvedLevel?: number;
  attemptStatus: string;
  attemptCanClaim: boolean;
}) {
  if (input.result !== 'SAFE') return false;
  if (input.latestResolvedLevel !== input.requestedLevel) return true;
  if (input.attemptStatus === 'IN_PROGRESS') return !input.attemptCanClaim;
  return input.attemptStatus !== 'COMPLETED';
}

export function getTowerScrollBehavior(reason: TowerScrollReason, reducedMotion: boolean): ScrollBehavior {
  return reason === 'climb' && !reducedMotion ? 'smooth' : 'auto';
}

export function shouldShowTowerAttemptExpiry(status?: string | null) {
  return status === 'IN_PROGRESS' || status === 'COMPLETED';
}

export function orderTowerFloors<T extends { level: number }>(floors: readonly T[]) {
  return [...floors].sort((a, b) => b.level - a.level);
}

export function getTowerFocusedLevel(input: {
  attemptLevel: number;
  attemptStatus: string;
  pendingSafeLevel?: number;
}) {
  if (
    input.attemptStatus === 'IN_PROGRESS'
    && input.pendingSafeLevel
    && input.pendingSafeLevel < input.attemptLevel
  ) {
    return input.pendingSafeLevel;
  }
  return input.attemptLevel;
}

export function getTowerFloorPresentation(input: {
  level: number;
  focusedLevel: number;
  attemptStatus: string;
  historyResult?: 'SAFE' | 'LOSS';
  pendingSafeLevel?: number;
}): TowerFloorPresentation {
  if (input.historyResult === 'LOSS') return 'lost';
  if (input.attemptStatus !== 'IN_PROGRESS') {
    return input.historyResult === 'SAFE' ? 'cleared' : 'revealed';
  }
  if (input.level === input.pendingSafeLevel) return 'pending-safe';
  if (input.level === input.focusedLevel) return 'current';
  if (input.historyResult === 'SAFE') return 'cleared';
  return 'locked';
}

export function getTowerMiniCardPresentation(input: {
  position: number;
  selectedPosition?: number;
  historyResult?: 'SAFE' | 'LOSS';
  redPosition?: number;
}): TowerMiniCardPresentation {
  if (input.redPosition !== undefined) {
    if (input.position === input.redPosition) return 'red';
    if (input.historyResult === 'SAFE' && input.position === input.selectedPosition) {
      return 'selected-safe';
    }
    return 'safe';
  }
  if (input.historyResult === 'SAFE' && input.position === input.selectedPosition) {
    return 'selected-safe';
  }
  return 'neutral';
}

export function getTowerScreen(input: {
  enabled: boolean;
  availableTokens: number;
  attemptStatus?: string | null;
  loading?: boolean;
  error?: string;
}): TowerScreen {
  if (input.error) return 'error';
  if (input.loading) return 'loading';
  if (!input.enabled) return 'disabled';
  if (input.attemptStatus === 'IN_PROGRESS') return 'active';
  if (input.attemptStatus === 'LOST') return 'lost';
  if (input.attemptStatus === 'COMPLETED') return 'completed';
  if (input.attemptStatus === 'CLAIMED') return 'claimed';
  if (input.attemptStatus === 'TIMED_OUT') return 'timed-out';
  if (input.attemptStatus === 'EXPIRED') return 'expired';
  return input.availableTokens > 0 ? 'ready' : 'no-ticket';
}
