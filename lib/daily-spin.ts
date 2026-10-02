import { prisma } from '@/lib/prisma';

export const STREAK_EPIC_TARGET = 10;
const STREAK_LOOKBACK_LIMIT = STREAK_EPIC_TARGET + 2;
const STREAK_RESET_RARITIES = new Set(['EPIC', 'LEGENDARY']);

// Helper to get the effective "spin date" in YYYY-MM-DD format (IST)
// If the current IST hour is less than resetHour, it counts as the previous day.
export function getEffectiveSpinDate(resetHour: number = 0, now: Date = new Date()): { spinDate: string; nextReset: Date } {

  // Get current time in IST
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  // Parse the formatted parts
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);

  const istYear = getPart('year');
  const istMonth = getPart('month') - 1; // 0-indexed for Date
  const istDay = getPart('day');
  const istHour = getPart('hour') === 24 ? 0 : getPart('hour'); // some browsers return 24 for midnight

  // Create a Date object representing the IST time (treating the local parts as UTC for manipulation)
  const istDate = new Date(Date.UTC(istYear, istMonth, istDay, istHour));

  if (istHour < resetHour) {
    // If before reset hour, it belongs to the previous "spin day"
    istDate.setUTCDate(istDate.getUTCDate() - 1);
  }

  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const spinDateStr = `${year}-${month}-${day}`;

  // Calculate next reset time in absolute UTC by adding 1 day to the effective date and setting hour to resetHour
  // Then converting back from IST to UTC
  // Effective Date is: istDate (UTC representation of IST date)
  const nextResetIst = new Date(Date.UTC(year, istDate.getUTCMonth(), istDate.getUTCDate() + 1, resetHour, 0, 0, 0));

  // Since nextResetIst is treating IST values as UTC, to get actual UTC we subtract the 5.5 hour offset
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const nextResetUtc = new Date(nextResetIst.getTime() - istOffsetMs);

  return { spinDate: spinDateStr, nextReset: nextResetUtc };
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
