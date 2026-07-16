import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import crypto from 'crypto';
import { encryptNumber } from '@/lib/crypto';

const STREAK_EPIC_TARGET = 10;
const STREAK_RESET_RARITIES = new Set(['EPIC', 'LEGENDARY']);

// Helper to get the effective "spin date" in YYYY-MM-DD format (IST)
// If the current IST hour is less than resetHour, it counts as the previous day.
function getEffectiveSpinDate(resetHour: number = 0): { spinDate: string; nextReset: Date } {
  const now = new Date();

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

// Fetch all relevant settings at once
async function getSettings() {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'daily_spin_enabled',
          'daily_spin_retries_enabled',
          'daily_spin_max_retries',
          'daily_spin_reset_hour'
        ]
      }
    }
  });

  const map = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);

  return {
    enabled: map.daily_spin_enabled !== 'false', // Default true if missing
    retriesEnabled: map.daily_spin_retries_enabled === 'true',
    maxRetries: parseInt(map.daily_spin_max_retries || '1', 10),
    resetHour: parseInt(map.daily_spin_reset_hour || '0', 10),
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

function calculateCurrentStreak(
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

function pickWeightedItem<T extends { weight: number }>(items: T[]) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const randomVal = crypto.randomInt(0, totalWeight);

  let cumulativeWeight = 0;
  for (const item of items) {
    cumulativeWeight += item.weight;
    if (randomVal < cumulativeWeight) {
      return item;
    }
  }

  return items[0];
}

async function getUserStreakSnapshot(userId: string, effectiveToday: string) {
  const spins = await prisma.userDailySpin.findMany({
    where: { userId },
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
  });

  const current = calculateCurrentStreak(spins, effectiveToday);

  return {
    current,
    target: STREAK_EPIC_TARGET,
    guaranteedToday: current + 1 >= STREAK_EPIC_TARGET,
    spinsRemaining: Math.max(0, STREAK_EPIC_TARGET - current),
  };
}

export async function GET() {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const settings = await getSettings();
    if (!settings.enabled) {
      return NextResponse.json({ enabled: false });
    }

    const { spinDate, nextReset } = getEffectiveSpinDate(settings.resetHour);

    const spin = await prisma.userDailySpin.findUnique({
      where: {
        userId_spinDate: {
          userId: session.user.id,
          spinDate: spinDate,
        }
      },
      include: {
        lootItem: true
      }
    });

    const streak = await getUserStreakSnapshot(session.user.id, spinDate);

    let canSpin = true;
    let remainingRetries = settings.retriesEnabled ? settings.maxRetries : 0;

    if (spin) {
      if (!settings.retriesEnabled || spin.attempts > settings.maxRetries) {
        canSpin = false;
        remainingRetries = 0;
      } else {
        remainingRetries = settings.maxRetries - spin.attempts + 1;
      }
    }

    const items = await prisma.lootItem.findMany({ where: { enabled: true } });

    const encryptedItems = items.map((item) => ({
      ...item,
      weight: encryptNumber(item.weight),
    }));
    const encryptedSpin = spin ? {
      ...spin,
      lootItem: spin.lootItem ? {
        ...spin.lootItem,
        weight: encryptNumber(spin.lootItem.weight),
      } : null,
    } : null;

    return NextResponse.json({
      enabled: true,
      canSpin,
      spin: encryptedSpin,
      remainingRetries,
      streak,
      nextReset: nextReset.toISOString(),
      lootItems: encryptedItems,
    });

  } catch (error) {
    console.error('Daily spin GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST() {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const settings = await getSettings();
    if (!settings.enabled) {
      return NextResponse.json({ error: 'Daily spin is currently disabled' }, { status: 403 });
    }

    const { spinDate, nextReset } = getEffectiveSpinDate(settings.resetHour);

    // 1. Check eligibility and lock (using atomic update or transaction)
    // Note: SQLite doesn't support SELECT ... FOR UPDATE or advanced concurrency locks.
    // We rely on the UNIQUE constraint on (userId, spinDate) to prevent double inserts,
    // and upsert for retries. In production with Postgres, transactions are safer.

    const existingSpin = await prisma.userDailySpin.findUnique({
      where: {
        userId_spinDate: {
          userId: session.user.id,
          spinDate: spinDate,
        }
      }
    });

    if (existingSpin) {
      if (!settings.retriesEnabled) {
        return NextResponse.json({ error: 'Already spun today' }, { status: 429 });
      }
      if (existingSpin.attempts > settings.maxRetries) {
        return NextResponse.json({ error: 'Max retries reached for today' }, { status: 429 });
      }
    }

    // 2. Perform weighted random selection
    const items = await prisma.lootItem.findMany({
      where: { enabled: true }
    });

    if (items.length === 0) {
      return NextResponse.json({ error: 'No rewards available' }, { status: 500 });
    }

    const streakBeforeSpin = await getUserStreakSnapshot(session.user.id, spinDate);
    const eligibleEpicItems = items.filter((item) => {
      const rarity = item.rarity?.toUpperCase() ?? 'COMMON';
      return rarity === 'EPIC';
    });

    const isGuaranteedEpicSpin =
      streakBeforeSpin.guaranteedToday &&
      eligibleEpicItems.length > 0;

    const selectedItem = isGuaranteedEpicSpin
      ? pickWeightedItem(eligibleEpicItems)
      : pickWeightedItem(items);

    // 3. Record the spin
    const spinRecord = await prisma.userDailySpin.upsert({
      where: {
        userId_spinDate: {
          userId: session.user.id,
          spinDate: spinDate,
        }
      },
      update: {
        lootItemId: selectedItem.id,
        attempts: { increment: 1 },
      },
      create: {
        userId: session.user.id,
        spinDate: spinDate,
        lootItemId: selectedItem.id,
        attempts: 1,
      },
      include: {
        lootItem: true
      }
    });

    const encryptedReward = {
      ...selectedItem,
      weight: encryptNumber(selectedItem.weight),
    };
    const encryptedSpinRecord = {
      ...spinRecord,
      lootItem: spinRecord.lootItem ? {
        ...spinRecord.lootItem,
        weight: encryptNumber(spinRecord.lootItem.weight),
      } : null,
    };

    return NextResponse.json({
      success: true,
      reward: encryptedReward,
      spinRecord: encryptedSpinRecord,
      streak: {
        current: 0,
        target: STREAK_EPIC_TARGET,
        guaranteedToday: false,
        spinsRemaining: STREAK_EPIC_TARGET,
      },
      streakReward: isGuaranteedEpicSpin,
      nextReset: nextReset.toISOString(),
    });

  } catch (error: any) {
    console.error('Daily spin POST error:', error);
    // Handle unique constraint violation from concurrent requests
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Already spun today' }, { status: 429 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
