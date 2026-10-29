import { randomInt } from 'node:crypto';
import { prisma } from './prisma';
import { calculateLegendaryProgress, getEffectiveSpinDate, getSpinSettings, getUserStreakSnapshot } from './daily-spin';
import { featureEnabled, receipt, requestIdSchema, requireCurrentUser, RewardError, rewardTransaction, saveReceipt } from './november';

export function selectWeighted<T extends { weight: number }>(items: T[], roll: (max: number) => number = max => randomInt(max)) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (!items.length || !Number.isSafeInteger(total) || total <= 0 || total > 2 ** 32 - 1 || items.some(i => !Number.isSafeInteger(i.weight) || i.weight <= 0)) {
    throw new RewardError('INVALID_REWARDS', 'Spin rewards need admin configuration.', 503);
  }
  let value = roll(total);
  if (!Number.isInteger(value) || value < 0 || value >= total) throw new Error('INVALID_RANDOM_VALUE');
  for (const item of items) { value -= item.weight; if (value < 0) return item; }
  throw new Error('INVALID_RANDOM_VALUE');
}

export async function performDailySpin(userId: string, input: { requestId?: string; spinDate?: string } = {}, now = new Date(), roll?: (max: number) => number) {
  if (input.requestId && !input.spinDate) {
    requestIdSchema.parse(input.requestId);
    await requireCurrentUser(userId);
    const previous = await prisma.rewardReceipt.findUnique({ where: { actorId_operation_requestId: { actorId: userId, operation: 'DAILY_SPIN', requestId: input.requestId } } });
    if (previous) return JSON.parse(previous.response);
  }
  const settings = await getSpinSettings();
  const period = getEffectiveSpinDate(settings.resetHour, now);
  const spinDate = input.spinDate ?? period.spinDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spinDate)) throw new RewardError('INVALID_DATE', 'Invalid spin date.');
  const requestId = requestIdSchema.parse(input.requestId ?? `daily-${spinDate}-${userId}`);
  const payload = { spinDate };
  return rewardTransaction(async tx => {
    await requireCurrentUser(userId, tx);
    const replay = await receipt<any>(tx, userId, 'DAILY_SPIN', requestId, payload);
    if (replay) return replay;
    const existing = await tx.userDailySpin.findUnique({ where: { userId_spinDate: { userId, spinDate } }, include: { lootItem: true } });
    if (existing) {
      const reward = existing.rewardSnapshot ? JSON.parse(existing.rewardSnapshot) : existing.lootItem;
      const owner = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { legendaryPity: true } });
      const result = { success: true, reward, spinRecord: { ...existing, lootItem: reward }, streak: await getUserStreakSnapshot(userId, spinDate, tx), legendary: { enabled: await featureEnabled('legendary_pity_30_enabled', tx), current: owner.legendaryPity, target: 30, spinsRemaining: Math.max(1, 30 - owner.legendaryPity) }, remainingRetries: 0, streakReward: existing.guaranteeReason === 'EPIC', nextReset: period.nextReset.toISOString(), recovered: true };
      await saveReceipt(tx, userId, 'DAILY_SPIN', requestId, payload, result);
      return result;
    }
    if (spinDate !== period.spinDate) throw new RewardError('SPIN_DATE_CHANGED', 'The daily reset has passed. Refresh before spinning.', 409);
    const freshSettings = await getSpinSettings(tx);
    if (!freshSettings.enabled) throw new RewardError('SPIN_PAUSED', 'Daily spin is paused.', 403);
    if (getEffectiveSpinDate(freshSettings.resetHour, now).spinDate !== spinDate) throw new RewardError('SPIN_DATE_CHANGED', 'Spin settings changed. Refresh before spinning.', 409);
    const enabled = await featureEnabled('legendary_pity_30_enabled', tx);
    const epoch = enabled ? await tx.setting.upsert({ where: { key: 'legendary_pity_launched_at' }, create: { key: 'legendary_pity_launched_at', value: now.toISOString() }, update: {} }) : await tx.setting.findUnique({ where: { key: 'legendary_pity_launched_at' } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { legendaryPity: true } });
    const lastSpin = await tx.userDailySpin.findFirst({ where: { userId, spinDate: { lte: spinDate } }, orderBy: { spinDate: 'desc' }, select: { spinDate: true } });
    const progress = calculateLegendaryProgress(user.legendaryPity, lastSpin?.spinDate ?? null, spinDate);
    const streak = await getUserStreakSnapshot(userId, spinDate, tx);
    const items = await tx.lootItem.findMany({ where: { enabled: true, weight: { gt: 0 } }, orderBy: { id: 'asc' } });
    const legendaryPool = items.filter(i => i.rarity?.toUpperCase() === 'LEGENDARY');
    const epicPool = items.filter(i => i.rarity?.toUpperCase() === 'EPIC');
    const guaranteedLegendary = enabled && progress >= 29;
    if (guaranteedLegendary && !legendaryPool.length) throw new RewardError('LEGENDARY_UNAVAILABLE', 'Legendary rewards are temporarily unavailable. Your spin is unused.', 503);
    const reason = guaranteedLegendary ? 'LEGENDARY' : streak.guaranteedToday && epicPool.length ? 'EPIC' : 'NATURAL';
    const selected = selectWeighted(reason === 'LEGENDARY' ? legendaryPool : reason === 'EPIC' ? epicPool : items, roll);
    const reward = { id: selected.id, name: selected.name, description: selected.description, iconUrl: selected.iconUrl, rarity: selected.rarity };
    const rarity = selected.rarity?.toUpperCase() ?? 'COMMON';
    const current = epoch ? rarity === 'LEGENDARY' ? 0 : progress + 1 : progress;
    const spinRecord = await tx.userDailySpin.create({ data: { userId, spinDate, lootItemId: selected.id, attempts: 1, awardedRarity: rarity, rewardSnapshot: JSON.stringify(reward), guaranteeReason: reason } });
    if (epoch) await tx.user.update({ where: { id: userId }, data: { legendaryPity: current } });
    const result = { success: true, reward, spinRecord: { ...spinRecord, lootItem: reward }, streak: await getUserStreakSnapshot(userId, spinDate, tx), legendary: { enabled, current, target: 30, spinsRemaining: Math.max(1, 30 - current) }, remainingRetries: 0, streakReward: reason === 'EPIC', guaranteeReason: reason, nextReset: period.nextReset.toISOString() };
    await saveReceipt(tx, userId, 'DAILY_SPIN', requestId, payload, result);
    return result;
  });
}

export async function recoverDailySpin(userId: string, requestId: string) {
  requestIdSchema.parse(requestId);
  const row = await prisma.rewardReceipt.findUnique({ where: { actorId_operation_requestId: { actorId: userId, operation: 'DAILY_SPIN', requestId } } });
  if (!row) throw new RewardError('NOT_FOUND', 'No committed result yet. Retry the same request.', 404);
  return JSON.parse(row.response);
}
