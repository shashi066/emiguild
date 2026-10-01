import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import crypto from 'crypto';
import { getSpinSettings, getEffectiveSpinDate, getUserStreakSnapshot, getSpinState } from '@/lib/daily-spin';
import { encryptNumber } from '@/lib/crypto';

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

export async function GET() {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { settings, nextReset, spin, streak, canSpin, remainingRetries, items } = await getSpinState(session.user.id);
    if (!settings.enabled) return NextResponse.json({ enabled: false });

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
    const settings = await getSpinSettings();
    if (!settings.enabled) {
      return NextResponse.json({ error: 'Daily spin is currently disabled' }, { status: 403 });
    }

    const { spinDate, nextReset } = getEffectiveSpinDate(settings.resetHour);

    const existingSpin = await prisma.userDailySpin.findUnique({
      where: {
        userId_spinDate: {
          userId: session.user.id,
          spinDate: spinDate,
        }
      }
    });

    if (existingSpin) {
      return NextResponse.json({ error: 'Today’s spin used. Come back after the daily reset.' }, { status: 429 });
    }

    // 2. Perform weighted random selection
    const items = await prisma.lootItem.findMany({
      where: { enabled: true, weight: { gt: 0 } }
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
    // The unique user/day key makes concurrent submissions first-write-wins.
    const spinRecord = await prisma.userDailySpin.create({
      data: {
        userId: session.user.id,
        spinDate,
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
      streak: await getUserStreakSnapshot(session.user.id, spinDate),
      remainingRetries: 0,
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
