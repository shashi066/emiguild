import { getIstDateKey, getNextIstMidnight } from '@/lib/armory-clock';
import { prisma } from '@/lib/prisma';

export const STREAK_EPIC_TARGET = 10;
const STREAK_LOOKBACK_LIMIT = STREAK_EPIC_TARGET + 2;
const STREAK_RESET_RARITIES = new Set(['EPIC', 'LEGENDARY']);

// Helper to get the effective "spin date" in YYYY-MM-DD format (IST)
// If the current IST hour is less than resetHour, it counts as the previous day.
export function getEffectiveSpinDate(resetHour: number = 0, now: Date = new Date()): { spinDate: string; nextReset: Date } {

  const offset = normalizeSpinResetHour(resetHour) * 60 * 60_000;
  const shifted = new Date(now.getTime() - offset);
  return { spinDate: getIstDateKey(shifted), nextReset: new Date(getNextIstMidnight(shifted).getTime() + offset) };
}

export function normalizeSpinResetHour(value: unknown) {
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 0;
}

// Fetch all relevant settings at once
export async function getSpinSettings() {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'daily_spin_enabled',
          'daily_spin_reset_hour'
        ]
      }
    }
  });

  const map = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);

  return {
    enabled: map.daily_spin_enabled !== 'false', // Default true if missing
    retriesEnabled: false,
    maxRetries: 0,
    resetHour: normalizeSpinResetHour(map.daily_spin_reset_hour),
  };
}

function parseSpinDate(spinDate: string) {
  return new Date(`${spinDate}T00:00:00.000Z`);
}

function formatSpinDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(spinDate: string, days: number) {
  const date = parseSpinDate(spinDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatSpinDate(date);
}

function isStreakResetReward(spin: { lootItem?: { rarity?: string | null } | null }) {
  const rarity = spin.lootItem?.rarity?.toUpperCase() ?? 'COMMON';
  return STREAK_RESET_RARITIES.has(rarity);
}

export function calculateCurrentStreak(
  spins: Array<{ spinDate: string; lootItem?: { rarity?: string | null } | null }>,
  effectiveToday: string
) {
  const spinByDate = new Map(spins.map((spin) => [spin.spinDate, spin]));
  const todaySpin = spinByDate.get(effectiveToday);

  let cursor = todaySpin ? effectiveToday : addDays(effectiveToday, -1);
  let streak = 0;

  while (true) {
    const spin = spinByDate.get(cursor);
    if (!spin || isStreakResetReward(spin)) {
      break;
    }

    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export async function getUserStreakSnapshot(userId: string, effectiveToday: string) {
  const spins = await prisma.userDailySpin.findMany({
    where: {
      userId,
      spinDate: { lte: effectiveToday },
    },
    select: {
      spinDate: true,
      lootItem: {
        select: {
          rarity: true,
        },
      },
    },
    orderBy: {
      spinDate: 'desc',
    },
    take: STREAK_LOOKBACK_LIMIT,
  });

  const current = calculateCurrentStreak(spins, effectiveToday);

  return {
    current,
    target: STREAK_EPIC_TARGET,
    guaranteedToday: current + 1 >= STREAK_EPIC_TARGET,
    spinsRemaining: Math.max(0, STREAK_EPIC_TARGET - current),
  };
}

export function getSpinAvailability(settings: { enabled: boolean; retriesEnabled: boolean; maxRetries: number }, spin: { attempts: number } | null) {
  // A legacy retry setting or attempts count can never grant a second daily spin.
  const remainingAttempts = settings.enabled && !spin ? 1 : 0;
  return { canSpin: remainingAttempts === 1, remainingAttempts, remainingRetries: 0 };
}

export async function getSpinState(userId: string, now: Date = new Date()) {
  const settings = await getSpinSettings();
  const { spinDate, nextReset } = getEffectiveSpinDate(settings.resetHour, now);
  const [spin, streak, items] = await Promise.all([
    prisma.userDailySpin.findUnique({ where: { userId_spinDate: { userId, spinDate } }, include: { lootItem: true } }),
    getUserStreakSnapshot(userId, spinDate),
    prisma.lootItem.findMany({ where: { enabled: true } }),
  ]);
  return { settings, spinDate, nextReset, spin, streak, items, ...getSpinAvailability(settings, spin) };
}

export async function getSpinEligibility(userId: string, now = new Date()) {
  const settings = await getSpinSettings();
  const { spinDate, nextReset } = getEffectiveSpinDate(settings.resetHour, now);
  const spin = await prisma.userDailySpin.findUnique({
    where: { userId_spinDate: { userId, spinDate } }, select: { attempts: true },
  });
  return { settings, spinDate, nextReset, ...getSpinAvailability(settings, spin) };
}
