import type { ExpeditionEligibility } from './guess-36-bonuses';
import type { Guess36CounterReward } from './guess-36-types';
import { addIstDateDays, getIstDateKey, getIstMidnight } from './guess-36-clock';

export type MineColor = 'GREEN' | 'RED' | 'YELLOW';
export type MineStatus = 'ACTIVE' | 'COLLECTED' | 'LOST' | 'TIMED_OUT' | 'COMPLETED';
export type MineReward = { type: 'GAMING_TIME' | 'PASS'; name: string; value?: number };
export const MINE_RULES = {
  version: 'mine-run-v1', tiles: 36, greens: 5, reds: 5, durationSeconds: 90,
  rewards: [
    ...[15, 30, 60, 120].map(value => ({ type: 'GAMING_TIME' as const, name: `${value} minutes gaming`, value })),
    { type: 'PASS', name: 'Bronze Pass (10 Hours)' },
  ] as MineReward[],
};

export function generateMineBoard(randomInt: (max: number) => number): MineColor[] {
  const board: MineColor[] = [...Array<MineColor>(5).fill('GREEN'), ...Array<MineColor>(5).fill('RED'), ...Array<MineColor>(26).fill('YELLOW')];
  for (let i = board.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid random source');
    [board[i], board[j]] = [board[j], board[i]];
  }
  return board;
}
export function parseMineBoard(raw: string | null): MineColor[] {
  const board: unknown = JSON.parse(raw ?? 'null');
  if (!Array.isArray(board) || board.length !== 36 || board.filter(c => c === 'GREEN').length !== 5
    || board.filter(c => c === 'RED').length !== 5 || board.filter(c => c === 'YELLOW').length !== 26) throw new Error('Invalid saved board');
  return board as MineColor[];
}
export function parseMineRevealed(raw: string): number[] {
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values) || new Set(values).size !== values.length || values.some(v => !Number.isInteger(v) || v < 0 || v >= 36)) throw new Error('Invalid saved reveals');
  return values;
}
export function mineReward(rules: typeof MINE_RULES, greens: number): MineReward | null {
  return greens > 0 ? rules.rewards[greens - 1] : null;
}
export function mineTicketExpiry(settledAt: Date) {
  return getIstMidnight(addIstDateDays(getIstDateKey(settledAt), 2));
}

export type MineRun = {
  id: string; date: string; status: MineStatus; version: number;
  startedAt: string; expiresAt: string; settledAt: string | null;
  tiles: { index: number; color: MineColor }[]; greens: number;
  reward: MineReward | null; nextReward: MineReward | null; ticketId: string | null;
  ticket?: { id: string; status: string; expiresAt: string } | null;
};
export type MineState = {
  recoveryKey: string | null; eligibility: ExpeditionEligibility;
  mode: 'MINES'; enabled: boolean; authenticated: boolean; serverNow: string; date: string;
  nextDayAt: string; legacyUsedToday: boolean; run: MineRun | null;
  rules: typeof MINE_RULES;
  rewardTickets: { id: string; expiresAt: string; reward: Guess36CounterReward }[];
};

export type MineActionResponse = { run: MineRun; serverNow: string; eligibility?: ExpeditionEligibility };
