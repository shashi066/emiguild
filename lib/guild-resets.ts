import { randomUUID } from 'node:crypto';
import { bankedExpiry } from './happy-ticket-rules';
import { audit, featureEnabled, receipt, requireCurrentUser, RewardError, rewardTransaction, saveReceipt } from './november';
export type ResetInput = { requestId: string; action: 'FORCE' | 'BANK' | 'CANCEL'; reason: string; grantId?: string; expectedAccounts?: number };

export async function activateBankedReset(actorId: string, input: { requestId: string; resetId: string; version: number }, now = new Date()) {
  const { requestId, ...payload } = input;
  return rewardTransaction(async tx => {
    await requireCurrentUser(actorId, tx);
    const replay = await receipt<{ available: number; resetId: string; version: number }>(tx, actorId, 'HAPPY_RESET', requestId, payload);
    if (replay) return replay;
    if (!await featureEnabled('guild_resets_enabled', tx)) throw new RewardError('RESETS_PAUSED', 'Guild Resets are paused.', 403);
    const reset = await tx.guildReset.findFirst({ where: { id: input.resetId, userId: actorId, kind: 'BANKED' } });
    if (!reset || reset.status !== 'PENDING') throw new RewardError('RESET_UNAVAILABLE', 'This reset is not available in your account.', 409);
    if (!reset.expiresAt || reset.expiresAt <= now) throw new RewardError('RESET_EXPIRED', 'This banked reset expired.', 410);
    const owner = await tx.user.findUniqueOrThrow({ where: { id: actorId }, select: { happyAvailable: true, happyVersion: true } });
    if (owner.happyVersion !== input.version) throw new RewardError('STALE_POOL', 'Your tickets changed. Refresh before using a reset.', 409);
    const changed = await tx.guildReset.updateMany({ where: { id: reset.id, userId: actorId, status: 'PENDING', expiresAt: { gt: now } }, data: { status: 'ACTIVATED', activatedAt: now } });
    if (changed.count !== 1) throw new RewardError('RESET_UNAVAILABLE', 'This reset changed. Refresh first.', 409);
    await tx.user.update({ where: { id: actorId }, data: { happyAvailable: 5, happyVersion: { increment: 1 }, happyLastRefillId: reset.id, happyLastRefillAt: now } });
    await audit(tx, actorId, 'POOL_ACTIVATE', reset.id, { available: owner.happyAvailable }, { available: 5, userId: actorId }, { resetId: reset.id, createdAt: now });
    const result = { available: 5, resetId: reset.id, version: owner.happyVersion + 1 };
    await saveReceipt(tx, actorId, 'HAPPY_RESET', requestId, payload, result);
    return result;
  });
}

/** Every bulk grant snapshots existing accounts in one serializable transaction. */
export async function changeGuildReset(actorId: string, input: ResetInput, now = new Date()) {
  const { requestId, ...payload } = input;
  const grantId = randomUUID();
  return rewardTransaction(async tx => {
    await requireCurrentUser(actorId, tx, true);
    const replay = await receipt<{ grantId: string; affectedCount: number; status: string; expiresAt: Date | string | null }>(tx, actorId, 'GUILD_RESET', requestId, payload);
    if (replay) return replay;
    if (!await featureEnabled('guild_resets_enabled', tx)) throw new RewardError('RESETS_PAUSED', 'Guild Resets are paused.', 403);
    if (!input.reason.trim() || input.reason.length > 500) throw new RewardError('REASON_REQUIRED', 'Provide a reason of 1-500 characters.');
    let result;
    if (input.action === 'CANCEL') {
      if (!input.grantId) throw new RewardError('RESET_UNAVAILABLE', 'Choose a reset grant.');
      const cancelled = await tx.guildReset.updateMany({ where: { grantId: input.grantId, kind: 'BANKED', status: 'PENDING', expiresAt: { gt: now } }, data: { status: 'CANCELLED', cancelledAt: now } });
      if (!cancelled.count) throw new RewardError('RESET_UNAVAILABLE', 'No unused unexpired copies remain.', 409);
      result = { grantId: input.grantId, affectedCount: cancelled.count, status: 'CANCELLED', expiresAt: null };
    } else {
      const users = await tx.user.findMany({ select: { id: true } });
      if (input.expectedAccounts !== undefined && users.length !== input.expectedAccounts) throw new RewardError('STALE_ACCOUNTS', 'The account count changed. Refresh and confirm again.', 409);
      const expiresAt = input.action === 'BANK' ? bankedExpiry(now) : null;
      await tx.guildReset.createMany({ data: users.map(user => ({ id: randomUUID(), userId: user.id, grantId, kind: input.action === 'BANK' ? 'BANKED' : 'FORCED', status: input.action === 'BANK' ? 'PENDING' : 'ACTIVATED', reason: input.reason, createdById: actorId, createdAt: now, expiresAt, activatedAt: input.action === 'FORCE' ? now : null })) });
      if (input.action === 'FORCE') await tx.user.updateMany({ where: { id: { in: users.map(user => user.id) } }, data: { happyAvailable: 5, happyVersion: { increment: 1 }, happyLastRefillId: grantId, happyLastRefillAt: now } });
      result = { grantId, affectedCount: users.length, status: input.action === 'BANK' ? 'PENDING' : 'ACTIVATED', expiresAt };
    }
    await audit(tx, actorId, `RESET_${input.action}`, result.grantId, null, { ...result, reason: input.reason }, { createdAt: now });
    await saveReceipt(tx, actorId, 'GUILD_RESET', requestId, payload, result);
    return result;
  });
}
