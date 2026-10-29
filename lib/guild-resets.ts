import { bankedExpiry } from './happy-ticket-rules';
import { audit, featureEnabled, receipt, requireCurrentUser, RewardError, rewardTransaction, saveReceipt, type RewardTx } from './november';
export type ResetInput = { requestId: string; action: 'FORCE' | 'BANK' | 'ACTIVATE' | 'CANCEL'; reason: string; resetId?: string; version?: number };

/** Shared atomic pool refill for member and admin operations. */
async function finalizeReset(tx: RewardTx, actorId: string, resetId: string, kind: 'FORCE' | 'ACTIVATE', version: number | undefined, now: Date) {
  const pool = await tx.happyPool.upsert({ where: { id: 'main' }, create: { id: 'main' }, update: {} });
  if (version !== pool.version) throw new RewardError('STALE_POOL', 'Tickets changed. Refresh before using a reset.', 409);
  const changed = await tx.happyPool.updateMany({ where: { id: 'main', version: pool.version }, data: { available: 5, version: { increment: 1 } } });
  if (!changed.count) throw new RewardError('STALE_POOL', 'Pool changed. Refresh first.', 409);
  await audit(tx, actorId, `POOL_${kind}`, resetId, { available: pool.available }, { available: 5 }, { resetId, createdAt: now });
}
async function changeBankedStatus(tx: RewardTx, resetId: string | undefined, action: 'ACTIVATE' | 'CANCEL', now: Date) {
  const reset = resetId ? await tx.guildReset.findUnique({ where: { id: resetId } }) : null;
  if (!reset || reset.kind !== 'BANKED' || reset.status !== 'PENDING') throw new RewardError('RESET_UNAVAILABLE', 'This banked reset is no longer pending.', 409);
  if (!reset.expiresAt || reset.expiresAt <= now) throw new RewardError('RESET_EXPIRED', 'This banked reset expired.', 410);
  const changed = await tx.guildReset.updateMany({ where: { id: reset.id, status: 'PENDING', expiresAt: { gt: now } }, data: action === 'ACTIVATE' ? { status: 'ACTIVATED', activatedAt: now } : { status: 'CANCELLED', cancelledAt: now } });
  if (changed.count !== 1) throw new RewardError('RESET_UNAVAILABLE', 'This reset changed. Refresh first.', 409);
  return tx.guildReset.findUniqueOrThrow({ where: { id: reset.id } });
}
export async function activateBankedReset(actorId: string, input: { requestId: string; resetId: string; version: number }, now = new Date()) {
  const { requestId, ...payload } = input;
  return rewardTransaction(async tx => {
    await requireCurrentUser(actorId, tx);
    const replay = await receipt<{ available: number; resetId: string }>(tx, actorId, 'HAPPY_RESET', requestId, payload);
    if (replay) return replay;
    if (!await featureEnabled('guild_resets_enabled', tx)) throw new RewardError('RESETS_PAUSED', 'Guild Resets are paused.', 403);
    await changeBankedStatus(tx, input.resetId, 'ACTIVATE', now);
    await finalizeReset(tx, actorId, input.resetId, 'ACTIVATE', input.version, now);
    const result = { available: 5, resetId: input.resetId };
    await saveReceipt(tx, actorId, 'HAPPY_RESET', requestId, payload, result);
    return result;
  });
}
export async function changeGuildReset(actorId: string, input: ResetInput, now = new Date()) {
  const { requestId, ...payload } = input;
  return rewardTransaction(async tx => {
    await requireCurrentUser(actorId, tx, true);
    const replay = await receipt<any>(tx, actorId, 'GUILD_RESET', requestId, payload);
    if (replay) return replay;
    if (!await featureEnabled('guild_resets_enabled', tx)) throw new RewardError('RESETS_PAUSED', 'Guild Resets are paused.', 403);
    if (!input.reason.trim() || input.reason.length > 500) throw new RewardError('REASON_REQUIRED', 'Provide a reason of 1-500 characters.');
    const reset = input.action === 'BANK' || input.action === 'FORCE'
      ? await tx.guildReset.create({ data: { kind: input.action === 'BANK' ? 'BANKED' : 'FORCED', status: input.action === 'BANK' ? 'PENDING' : 'ACTIVATED', reason: input.reason, createdById: actorId, createdAt: now, expiresAt: input.action === 'BANK' ? bankedExpiry(now) : null, activatedAt: input.action === 'FORCE' ? now : null } })
      : await changeBankedStatus(tx, input.resetId, input.action, now);
    if (input.action === 'FORCE' || input.action === 'ACTIVATE') {
      await finalizeReset(tx, actorId, reset.id, input.action, input.version, now);
    } else {
      await audit(tx, actorId, `RESET_${input.action}`, reset.id, null, { reason: input.reason, status: reset.status, expiresAt: reset.expiresAt }, { createdAt: now });
    }
    const result = { reset };
    await saveReceipt(tx, actorId, 'GUILD_RESET', requestId, payload, result);
    return result;
  });
}
