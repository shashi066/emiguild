import { getNextIstMidnight } from '@/lib/armory-clock';

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_TOWER_RUN_DURATION_SECONDS = 120;
export const TOWER_RUN_DURATION_OPTIONS_SECONDS = [60, 90, 120, 150, 180, 210, 240, 270, 300] as const;
export const TOWER_RUN_DURATION_MS = DEFAULT_TOWER_RUN_DURATION_SECONDS * 1000;
export const TOWER_WARNING_THRESHOLD_MS = 60_000;

export type TowerClockAnchor = {
  remainingMsAtAnchor: number;
  monotonicAnchorMs: number;
};

export function getTowerTokenExpiry(earnedAt: Date = new Date()) {
  return new Date(getNextIstMidnight(earnedAt).getTime() + DAY_MS);
}

export function getTowerRunExpiry(
  startedAt: Date,
  tokenExpiresAt: Date,
  runDurationSeconds: number = DEFAULT_TOWER_RUN_DURATION_SECONDS,
) {
  return new Date(Math.min(
    startedAt.getTime() + runDurationSeconds * 1000,
    tokenExpiresAt.getTime(),
  ));
}

export function isTowerDeadlineReached(deadline: Date | string, now: Date = new Date()) {
  return new Date(deadline).getTime() <= now.getTime();
}

export function createTowerClockAnchor(
  serverNowIso: unknown,
  runExpiresAtIso: unknown,
  monotonicNowMs: number,
): TowerClockAnchor | null {
  if (
    typeof serverNowIso !== 'string'
    || typeof runExpiresAtIso !== 'string'
    || !Number.isFinite(monotonicNowMs)
  ) return null;

  const serverNowMs = Date.parse(serverNowIso);
  const runExpiresAtMs = Date.parse(runExpiresAtIso);
  if (!Number.isFinite(serverNowMs) || !Number.isFinite(runExpiresAtMs)) return null;

  return {
    remainingMsAtAnchor: Math.max(0, runExpiresAtMs - serverNowMs),
    monotonicAnchorMs: monotonicNowMs,
  };
}

export function getTowerRemainingMs(anchor: TowerClockAnchor | null, monotonicNowMs: number) {
  if (!anchor || !Number.isFinite(monotonicNowMs)) return null;
  const elapsedMs = Math.max(0, monotonicNowMs - anchor.monotonicAnchorMs);
  return Math.max(0, anchor.remainingMsAtAnchor - elapsedMs);
}

export function formatTowerCountdown(remainingMs: number | null) {
  if (remainingMs === null || !Number.isFinite(remainingMs)) return '--:--';
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
