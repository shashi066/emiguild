import { readHappySettings, writeHappySettings } from './happy-config';
import { prisma } from './prisma';
import { HAPPY_COOLDOWN_MS, happyConfigSchema, happyExpiry, readHappyConfig, hasHappyWindow, happyBookingProblem, type HappyConfig } from './happy-ticket-rules';
import { audit, featureEnabled, getFeatureFlags, receipt, requireCurrentUser, RewardError, requestIdSchema, rewardTransaction, saveReceipt, type RewardTx } from './november';

export async function happyPoolState(userId?: string, now = new Date()) {
  const owner = { userId: userId ?? '' };
  const [pool, flags, account, bankedCount, nextReset] = await Promise.all([
    readHappySettings(),
    getFeatureFlags(['happy_tickets_enabled', 'guild_resets_enabled']),
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { happyAvailable: true, happyVersion: true, happyLastRefillId: true, happyLastRefillAt: true } }) : Promise.resolve(null),
    userId ? prisma.guildReset.count({ where: { ...owner, kind: 'BANKED', status: 'PENDING', expiresAt: { gt: now } } }) : Promise.resolve(0),
    userId ? prisma.guildReset.findFirst({ where: { ...owner, kind: 'BANKED', status: 'PENDING', expiresAt: { gt: now } }, orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }], select: { id: true, expiresAt: true } }) : Promise.resolve(null),
  ]);
  if (userId && !account) throw new RewardError('FORBIDDEN', 'Forbidden', 403);
  const rules = pool.config;
  return { available: account?.happyAvailable ?? 0, capacity: 5, version: account?.happyVersion ?? 0,
    banked: { count: bankedCount, next: nextReset, enabled: flags.guild_resets_enabled },
    lastRefill: account?.happyLastRefillId && account.happyLastRefillAt ? { id: account.happyLastRefillId, createdAt: account.happyLastRefillAt } : null,
    enabled: flags.happy_tickets_enabled && rules.stationIds.length > 0, rules, noEligibleWindow: !hasHappyWindow(rules, now), serverNow: now.toISOString() };
}
export async function happyWallet(userId: string, now = new Date()) {
  const [account, tickets] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { happyLastClaimedAt: true } }),
    prisma.happyTicket.findMany({ where: { userId }, orderBy: { claimedAt: 'desc' }, take: 40, include: { redemptions: { where: { status: 'APPLIED' }, select: { bookingId: true } } } }),
  ]);
  return { tickets: tickets.map(t => ({ ...t, status: t.status === 'CLAIMED' && t.expiresAt <= now ? 'EXPIRED' : t.status })),
    nextClaimAt: account?.happyLastClaimedAt ? new Date(account.happyLastClaimedAt.getTime() + HAPPY_COOLDOWN_MS).toISOString() : null, serverNow: now.toISOString() };
}
async function claimRate(userId: string, now: Date) {
  const allowed = await rewardTransaction(async tx => {
    const row = await tx.user.findUnique({ where: { id: userId }, select: { happyRateWindowAt: true, happyRateCount: true } });
    if (!row) throw new RewardError('FORBIDDEN', 'Forbidden', 403);
    const reset = !row.happyRateWindowAt || now.getTime() - row.happyRateWindowAt.getTime() >= 60_000;
    if (!reset && row.happyRateCount >= 10) return false;
    await tx.user.update({ where: { id: userId }, data: { happyRateWindowAt: reset ? now : row.happyRateWindowAt, happyRateCount: reset ? 1 : row.happyRateCount + 1 } });
    return true;
  });
  if (!allowed) { console.warn('happy_claim_rate_limited', { reason: 'ACCOUNT_LIMIT' }); throw new RewardError('RATE_LIMIT', 'Too many attempts. Try again in a minute.', 429); }
}
export async function claimHappyTicket(userId: string, requestId: string, now = new Date()) {
  requestIdSchema.parse(requestId);
  await requireCurrentUser(userId);
  const existing = await prisma.rewardReceipt.findUnique({ where: { actorId_operation_requestId: { actorId: userId, operation: 'HAPPY_CLAIM', requestId } } });
  if (!existing) await claimRate(userId, now);
  return rewardTransaction(async tx => {
    const replay = await receipt<any>(tx, userId, 'HAPPY_CLAIM', requestId, {});
    if (replay) return replay;
    if (!await featureEnabled('happy_tickets_enabled', tx)) throw new RewardError('CLAIMS_PAUSED', 'Happy Ticket claims are paused.', 403);
    const { config: rules } = await readHappySettings(tx);
    if (!rules.stationIds.length) throw new RewardError('NOT_CONFIGURED', 'Happy Tickets will be available after station setup.', 409);
    const account = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { happyLastClaimedAt: true, happyAvailable: true, happyVersion: true } });
    if (account.happyLastClaimedAt && now.getTime() < account.happyLastClaimedAt.getTime() + HAPPY_COOLDOWN_MS) throw new RewardError('CLAIM_COOLDOWN', 'Wait 24 hours between claims.', 409);
    const updated = await tx.user.updateMany({ where: { id: userId, happyVersion: account.happyVersion, happyAvailable: { gt: 0 } }, data: { happyAvailable: { decrement: 1 }, happyVersion: { increment: 1 }, happyLastClaimedAt: now } });
    if (!updated.count) throw new RewardError('POOL_EMPTY', 'You have no tickets left. Use one of your banked resets.', 409);
    const ticket = await tx.happyTicket.create({ data: { userId, rulesSnapshot: JSON.stringify(rules), claimedAt: now, expiresAt: happyExpiry(now) } });
    const result = { ticket, available: account.happyAvailable - 1, version: account.happyVersion + 1, nextClaimAt: new Date(now.getTime() + HAPPY_COOLDOWN_MS).toISOString() };
    await saveReceipt(tx, userId, 'HAPPY_CLAIM', requestId, {}, result);
    return result;
  });
}
export async function configureHappyPool(actorId: string, config: HappyConfig, version: number) {
  const rules = happyConfigSchema.parse(config);
  return rewardTransaction(async tx => {
    await requireCurrentUser(actorId, tx, true);
    const stations = await tx.station.count({ where: { id: { in: rules.stationIds }, hasControllers: true, isActive: true } });
    if (!rules.stationIds.length || stations !== new Set(rules.stationIds).size) throw new RewardError('INVALID_STATIONS', 'Select active PS5 stations.');
    const { previous, next } = await writeHappySettings(tx, rules, version);
    await audit(tx, actorId, 'HAPPY_CONFIG', 'main', previous.config, rules);
    return next;
  });
}
export async function applyHappyTicket(tx: RewardTx, input: { ticketId: string; userId: string; stationId: string; date: string; startTime: string; duration: number }, now: Date) {
  const ticket = await tx.happyTicket.findUnique({ where: { id: input.ticketId } });
  if (!ticket || ticket.userId !== input.userId || ticket.status !== 'CLAIMED') throw new RewardError('INVALID_TICKET', 'This ticket is unavailable.', 409);
  const station = await tx.station.findUnique({ where: { id: input.stationId } });
  if (!station?.isActive) throw new RewardError('INVALID_STATION', 'Station unavailable.', 409);
  const problem = happyBookingProblem({ ...input, config: readHappyConfig(ticket.rulesSnapshot), hasControllers: station.hasControllers, expiresAt: ticket.expiresAt, now });
  if (problem) throw new RewardError('TICKET_INELIGIBLE', problem, 409);
  const used = await tx.happyTicket.updateMany({ where: { id: ticket.id, userId: input.userId, status: 'CLAIMED', expiresAt: { gt: now } }, data: { status: 'REDEEMED', redeemedAt: now } });
  if (used.count !== 1) throw new RewardError('TICKET_USED', 'Ticket already used.', 409);
  return station.hourlyRate;
}
export async function restoreHappyTicket(tx: RewardTx, bookingId: string, now: Date) {
  const redemption = await tx.happyRedemption.findFirst({ where: { bookingId, status: 'APPLIED' }, include: { ticket: true } });
  if (!redemption || redemption.status !== 'APPLIED') return;
  await tx.happyRedemption.update({ where: { id: redemption.id }, data: { status: 'RESTORED', restoredAt: now, activeBookingId: null, activeTicketId: null } });
  await tx.happyTicket.update({ where: { id: redemption.ticketId }, data: { status: redemption.ticket.expiresAt > now ? 'CLAIMED' : 'EXPIRED', redeemedAt: null } });
}

export { editHappyBooking } from './admin-booking-edit';
