import { getIstDateKey, getNextIstMidnight } from '@/lib/armory-clock';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ENTRY_LOCK_MS = 5 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export { getIstDateKey, getNextIstMidnight };

export function isValidIstDateKey(value: string) {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function addIstDateDays(dateKey: string, days: number) {
  if (!isValidIstDateKey(dateKey)) throw new Error('INVALID_ROUND_DATE');
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function getPreviousIstDateKey(now: Date = new Date()) {
  return addIstDateDays(getIstDateKey(now), -1);
}

export function getIstMidnight(dateKey: string) {
  if (!isValidIstDateKey(dateKey)) throw new Error('INVALID_ROUND_DATE');
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

export function getGuess36TicketExpiry(drawTime: Date = new Date()) {
  return getNextIstMidnight(drawTime);
}

export function getGuess36EntryCutoff(now: Date = new Date()) {
  return new Date(getNextIstMidnight(now).getTime() - ENTRY_LOCK_MS);
}

export function isGuess36EntryOpen(now: Date = new Date()) {
  return now.getTime() < getGuess36EntryCutoff(now).getTime();
}

export function millisecondsUntilNextIstDay(now: Date = new Date()) {
  return Math.max(0, getNextIstMidnight(now).getTime() - now.getTime());
}

export const GUESS_36_DAY_MS = DAY_MS;
