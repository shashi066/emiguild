import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const EMIC_UNIT_FACTOR = 10;

export function displayEmicFromUnits(units: number) {
  const coins = units / EMIC_UNIT_FACTOR;
  return Number.isInteger(coins) ? coins : Number(coins.toFixed(1));
}

export async function getEmicBalanceUnits(
  userId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { watchPartyCoins: true },
  });
  return user?.watchPartyCoins ?? 0;
}

export async function creditEmicUnits(
  input: {
    userId: string;
    amountUnits: number;
    reason: string;
    note?: string;
    actorId?: string;
  },
  db: Prisma.TransactionClient,
) {
  if (!Number.isInteger(input.amountUnits) || input.amountUnits <= 0) {
    throw new Error('EMIC credit must use positive whole units.');
  }
  const user = await db.user.update({
    where: { id: input.userId },
    data: { watchPartyCoins: { increment: input.amountUnits } },
    select: { watchPartyCoins: true },
  });
  await db.watchPartyCoinLedger.create({
    data: {
      userId: input.userId,
      actorId: input.actorId,
      amountUnits: input.amountUnits,
      balanceAfterUnits: user.watchPartyCoins,
      reason: input.reason,
      note: input.note,
    },
  });
  return user.watchPartyCoins;
}
