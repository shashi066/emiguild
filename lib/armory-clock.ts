const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const FORGE_REFRESH_RETRY_MS = 30_000;

const istDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export type ForgeClockAnchor = {
  remainingMsAtAnchor: number;
  monotonicAnchorMs: number;
};

export function getIstDateKey(now: Date = new Date()) {
  const parts = istDateFormatter.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  if (!year || !month || !day) throw new Error('INVALID_IST_DATE');
  return `${year}-${month}-${day}`;
}

export function getNextIstMidnight(now: Date = new Date()) {
  const [year, month, day] = getIstDateKey(now).split('-').map(Number);
  const currentMidnightUtc = Date.UTC(year, month - 1, day) - IST_OFFSET_MS;
  return new Date(currentMidnightUtc + DAY_MS);
}

export function createForgeClockAnchor(
  serverNowIso: unknown,
  nextResetAtIso: unknown,
  monotonicNowMs: number,
): ForgeClockAnchor | null {
  if (
    typeof serverNowIso !== 'string'
    || typeof nextResetAtIso !== 'string'
    || !Number.isFinite(monotonicNowMs)
  ) {
    return null;
  }

  const serverNowMs = Date.parse(serverNowIso);
  const nextResetAtMs = Date.parse(nextResetAtIso);
  if (!Number.isFinite(serverNowMs) || !Number.isFinite(nextResetAtMs)) return null;

  return {
    remainingMsAtAnchor: Math.max(0, nextResetAtMs - serverNowMs),
    monotonicAnchorMs: monotonicNowMs,
  };
}

export function getForgeRemainingMs(anchor: ForgeClockAnchor | null, monotonicNowMs: number) {
  if (!anchor || !Number.isFinite(monotonicNowMs)) return null;
  const elapsedMs = Math.max(0, monotonicNowMs - anchor.monotonicAnchorMs);
  return Math.max(0, anchor.remainingMsAtAnchor - elapsedMs);
}

export function formatForgeCountdown(remainingMs: number | null) {
  if (remainingMs === null || !Number.isFinite(remainingMs)) return '--:--:--';
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getForgeRefreshRetryAt(monotonicNowMs: number) {
  return monotonicNowMs + FORGE_REFRESH_RETRY_MS;
}

export function canRetryForgeRefresh(monotonicNowMs: number, retryAtMs: number) {
  return monotonicNowMs >= retryAtMs;
}
