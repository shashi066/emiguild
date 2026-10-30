import { getAdminHappyTicketsReport } from '../../lib/admin-happy-tickets';
import { readHappySettings, parseHappySettings } from '../../lib/happy-config';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { prisma } from '../../lib/prisma';
import { performDailySpin, recoverDailySpin } from '../../lib/spin-rewards';
import { getSpinState } from '../../lib/daily-spin';
import { claimHappyTicket, configureHappyPool, applyHappyTicket, restoreHappyTicket } from '../../lib/happy-tickets';
import { activateBankedReset, changeGuildReset } from '../../lib/guild-resets';
import { rewardTransaction, requireCurrentUser } from '../../lib/november';
import { continueTowerAttempt, getTowerConfig, pickTowerCard, startTowerAttempt, claimTowerReward } from '../../lib/tower';

const url = process.env.DATABASE_URL ?? '';
if (url !== process.env.NOVEMBER_TEST_DATABASE_URL || !(url.includes('november-test') || /\/emiguild_november_[a-z0-9_]+(?:\?|$)/.test(url))) throw new Error('Use an explicitly named disposable November database.');
after(async () => { await prisma.$disconnect(); });
async function user(admin = false) { const id = randomUUID(); return prisma.user.create({ data: { name: 'November Test', email: `${id}@example.test`, password: 'not-a-real-password', role: admin ? 'ADMIN' : 'USER' } }); }
async function setting(key: string, value: string) { await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }); }
const now = new Date('2026-11-02T10:00:00+05:30');
const next = (day: number) => new Date(now.getTime() + day * 86_400_000);

test('Legendary boundary, ordinary probabilities, Epic interaction, immutable receipts and isolation', async () => {
  await prisma.lootItem.updateMany({ data: { enabled: false } });
  const suffix = randomUUID();
  const common = await prisma.lootItem.create({ data: { id: `a-${suffix}`, name: 'Common fixture', weight: 100, rarity: 'COMMON' } });
  const epic = await prisma.lootItem.create({ data: { id: `b-${suffix}`, name: 'Epic fixture', weight: 1, rarity: 'EPIC' } });
  const legendary = await prisma.lootItem.create({ data: { id: `c-${suffix}`, name: 'Legendary fixture', weight: 1, rarity: 'LEGENDARY' } });
  const owner = await user(); const other = await user();
  await setting('daily_spin_enabled', 'true'); await setting('legendary_pity_30_enabled', 'true');
  // Both guarantees require consecutive daily spins; Epic drops preserve Legendary progress.
  for (let i = 0; i < 28; i++) {
    const result = await performDailySpin(owner.id, { requestId: randomUUID() }, next(i), () => 0);
    assert.equal(result.reward.id, [9, 19].includes(i) ? epic.id : common.id); assert.equal(result.legendary.current, i + 1);
  }
  const result29 = await performDailySpin(owner.id, { requestId: randomUUID() }, next(28), () => 0);
  assert.equal(result29.legendary.current, 29);
  const requestId = randomUUID();
  const result30 = await performDailySpin(owner.id, { requestId }, next(29), () => 0);
  assert.equal(result30.reward.id, legendary.id); assert.equal(result30.legendary.current, 0);
  const replay = await performDailySpin(owner.id, { requestId, spinDate: '2026-12-01' }, next(30), () => 0);
  assert.equal(replay.spinRecord.id, result30.spinRecord.id);
  await assert.rejects(() => performDailySpin(owner.id, { requestId, spinDate: '2026-12-02' }, next(30)), /different action/);
  await assert.rejects(() => recoverDailySpin(other.id, requestId), /No committed result/);
  const natural = await performDailySpin(other.id, { requestId: randomUUID() }, now, max => max - 1);
  assert.equal(natural.reward.id, legendary.id); assert.equal(natural.legendary.current, 0);
  const streakUser = await user();
  for (let i = 0; i < 9; i++) await prisma.userDailySpin.create({ data: { userId: streakUser.id, lootItemId: common.id, awardedRarity: 'COMMON', spinDate: `2026-11-${String(i + 1).padStart(2, '0')}` } });
  const epicResult = await performDailySpin(streakUser.id, { requestId: randomUUID() }, new Date('2026-11-10T10:00:00+05:30'), () => 0);
  assert.equal(epicResult.reward.id, epic.id);
  const both = await user();
  await prisma.user.update({ where: { id: both.id }, data: { legendaryPity: 29 } });
  for (let i = 0; i < 9; i++) await prisma.userDailySpin.create({ data: { userId: both.id, lootItemId: common.id, awardedRarity: 'COMMON', spinDate: `2026-11-${String(i + 1).padStart(2, '0')}` } });
  assert.equal((await performDailySpin(both.id, { requestId: randomUUID() }, new Date('2026-11-10T10:00:00+05:30'), () => 0)).reward.id, legendary.id);
  await prisma.lootItem.update({ where: { id: legendary.id }, data: { name: 'Changed after grant', rarity: 'COMMON' } });
  assert.equal((await recoverDailySpin(owner.id, requestId)).reward.name, 'Legendary fixture');
  await prisma.user.update({ where: { id: owner.id }, data: { legendaryPity: 29 } });
  const before = await prisma.userDailySpin.count({ where: { userId: owner.id } });
  await assert.rejects(() => performDailySpin(owner.id, { requestId: randomUUID() }, next(30)), /Legendary rewards/);
  assert.equal(await prisma.userDailySpin.count({ where: { userId: owner.id } }), before);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).legendaryPity, 29);
  await prisma.lootItem.update({ where: { id: legendary.id }, data: { rarity: 'LEGENDARY' } });
  const concurrent = await user(); const rid = randomUUID();
  const results = await Promise.all(Array.from({ length: 3 }, () => performDailySpin(concurrent.id, { requestId: rid }, now, () => 0)));
  assert.equal(new Set(results.map(r => r.spinRecord.id)).size, 1);
  assert.equal((await getSpinState(concurrent.id, now)).legendary.current, 1);
});

test('Happy claims, last-ticket contention, cooldown, refill idempotency, banked expiry and restoration', async () => {
  const admin = await user(true); const owner = await user();
  const station = await prisma.station.create({ data: { name: 'Happy PS5', specs: 'test', description: 'test', hourlyRate: 150 } });
  const pool = await readHappySettings();
  await setting('happy_tickets_enabled', 'true'); await setting('guild_resets_enabled', 'true');
  await configureHappyPool(admin.id, { stationIds: [station.id], days: [1,2,3,4,5], startTime: '16:00', endTime: '23:00' }, pool.version);
  const rid = randomUUID(); const claimed = await claimHappyTicket(owner.id, rid, now);
  assert.equal(new Date(claimed.ticket.expiresAt).toISOString(), '2026-11-02T18:30:00.000Z');
  assert.equal((await claimHappyTicket(owner.id, rid, next(1))).ticket.id, claimed.ticket.id);
  await assert.rejects(() => claimHappyTicket(owner.id, randomUUID(), new Date(now.getTime() + 86_399_999)), /24 hours/);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).happyAvailable, 4);
  const contenders = await Promise.all([user(), user(), user()]);
  const claims = await Promise.allSettled(contenders.map(u => claimHappyTicket(u.id, randomUUID(), now)));
  assert.equal(claims.filter(r => r.status === 'fulfilled').length, 3);
  await prisma.user.update({ where: { id: owner.id }, data: { happyAvailable: 1, happyLastClaimedAt: null } });
  const races = await Promise.allSettled([1,2].map(() => claimHappyTicket(owner.id, randomUUID(), now)));
  assert.equal(races.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).happyAvailable, 0);
  const force = { requestId: randomUUID(), action: 'FORCE' as const, reason: 'Fixture refill' };
  const reset = await changeGuildReset(admin.id, force, now);
  assert.equal((await changeGuildReset(admin.id, force, now)).grantId, reset.grantId);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).happyAvailable, 5);
  await assert.rejects(() => claimHappyTicket(owner.id, randomUUID(), now), /24 hours/);
  const bank = await changeGuildReset(admin.id, { requestId: randomUUID(), action: 'BANK', reason: 'Banked fixture' }, new Date('2026-01-31T18:00:00+05:30'));
  assert.equal(new Date(bank.expiresAt!).toISOString(), '2026-02-28T12:30:00.000Z');
  const expiredCopy = await prisma.guildReset.findFirstOrThrow({ where: { grantId: bank.grantId, userId: owner.id } });
  await assert.rejects(() => activateBankedReset(owner.id, { requestId: randomUUID(), resetId: expiredCopy.id, version: 2 }, now), /expired/);
  await assert.rejects(() => changeGuildReset(owner.id, { ...force, requestId: randomUUID() }, now), /Forbidden/);
  await assert.rejects(() => requireCurrentUser(owner.id, prisma, true), /Forbidden/);
  const booking = await rewardTransaction(async tx => {
    const discount = await applyHappyTicket(tx, { ticketId: claimed.ticket.id, userId: owner.id, stationId: station.id, date: '2026-11-02', startTime: '16:00', duration: 2 }, now);
    assert.equal(discount, 150);
    const b = await tx.booking.create({ data: { userId: owner.id, stationId: station.id, date: '2026-11-02', startTime: '16:00', endTime: '18:00', duration: 2, totalPrice: 250, controllerCharge: 100, happyDiscount: discount, status: 'CONFIRMED' } });
    await tx.happyRedemption.create({ data: { ticketId: claimed.ticket.id, bookingId: b.id, activeBookingId: b.id, activeTicketId: claimed.ticket.id, discount } }); return b;
  });
  await assert.rejects(() => rewardTransaction(tx => applyHappyTicket(tx, { ticketId: claimed.ticket.id, userId: owner.id, stationId: station.id, date: '2026-11-02', startTime: '19:00', duration: 1 }, now)), /unavailable/);
  await rewardTransaction(tx => restoreHappyTicket(tx, booking.id, now));
  await rewardTransaction(tx => restoreHappyTicket(tx, booking.id, now));
  const restored = await prisma.happyTicket.findUniqueOrThrow({ where: { id: claimed.ticket.id } });
  assert.equal(restored.status, 'CLAIMED'); assert.equal(restored.expiresAt.toISOString(), '2026-11-02T18:30:00.000Z');
  await assert.rejects(() => rewardTransaction(async tx => { await applyHappyTicket(tx, { ticketId: claimed.ticket.id, userId: owner.id, stationId: station.id, date: '2026-11-02', startTime: '19:00', duration: 1 }, now); throw new Error('rollback fixture'); }), /rollback fixture/);
  assert.equal((await prisma.happyTicket.findUniqueOrThrow({ where: { id: claimed.ticket.id } })).status, 'CLAIMED');
});

test('Legendary missed-day reset appears before spinning and commits safely with receipt recovery', async () => {
  await prisma.lootItem.updateMany({ data: { enabled: false } });
  const suffix = randomUUID();
  const common = await prisma.lootItem.create({ data: { id: `a-gap-${suffix}`, name: 'Gap common', weight: 100, rarity: 'COMMON' } });
  const legendary = await prisma.lootItem.create({ data: { id: `z-gap-${suffix}`, name: 'Gap legendary', weight: 1, rarity: 'LEGENDARY' } });
  await setting('daily_spin_enabled', 'true'); await setting('daily_spin_reset_hour', '0'); await setting('legendary_pity_30_enabled', 'true');
  const owner = await user();
  await prisma.userDailySpin.create({ data: { userId: owner.id, lootItemId: common.id, spinDate: '2026-10-31', awardedRarity: 'COMMON' } });
  await prisma.user.update({ where: { id: owner.id }, data: { legendaryPity: 29 } });
  const before = await getSpinState(owner.id, now);
  assert.equal(before.legendary.current, 0); assert.equal(before.streak.current, 0);
  await assert.rejects(() => performDailySpin(owner.id, { requestId: randomUUID() }, now, () => { throw new Error('roll failure'); }), /roll failure/);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).legendaryPity, 29);
  assert.equal(await prisma.userDailySpin.count({ where: { userId: owner.id, spinDate: '2026-11-02' } }), 0);
  const requestId = randomUUID();
  const concurrent = await Promise.all(Array.from({ length: 3 }, () => performDailySpin(owner.id, { requestId }, now, () => 0)));
  const first = concurrent[0];
  assert.equal(new Set(concurrent.map(r => r.spinRecord.id)).size, 1);
  assert.equal(first.reward.id, common.id); assert.equal(first.legendary.current, 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).legendaryPity, 1);
  assert.equal((await getSpinState(owner.id, next(1))).legendary.current, 1);
  assert.equal((await getSpinState(owner.id, next(2))).legendary.current, 0);
  const replay = await performDailySpin(owner.id, { requestId }, next(2));
  assert.equal(replay.spinRecord.id, first.spinRecord.id); assert.equal(replay.legendary.current, 1);
  const restarted = await performDailySpin(owner.id, { requestId: randomUUID() }, next(2), () => 0);
  assert.equal(restarted.legendary.current, 1);
  const consecutive = await performDailySpin(owner.id, { requestId: randomUUID() }, next(3), () => 0);
  assert.equal(consecutive.legendary.current, 2);
  const natural = await performDailySpin(owner.id, { requestId: randomUUID() }, next(4), max => max - 1);
  assert.equal(natural.reward.id, legendary.id); assert.equal(natural.legendary.current, 0);
});

test('Tower last-cleared reward pays once; first-floor loss, legacy run and timeout stay unpaid', async () => {
  await getTowerConfig(); await setting('tower_enabled', 'true'); await setting('tower_loss_rewards_enabled', 'true');
  async function run(protection = true) {
    const owner = await user();
    await setting('tower_loss_rewards_enabled', String(protection));
    await prisma.towerToken.create({ data: { userId: owner.id, expiresAt: next(1), earnedAt: now } });
    const attempt = await startTowerAttempt(owner.id, now);
    return { owner, attempt };
  }
  const id = (attemptId: string, level: number, slot: string) => `card_${createHmac('sha256', process.env.TOWER_CARD_SECRET || process.env.AUTH_SECRET || 'tower-dev-secret').update(`${attemptId}:${level}:${slot}`).digest('base64url').slice(0,14)}`;
  async function pick(ownerId: string, attemptId: string, level: number, safe: boolean) {
    const row = await prisma.towerAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const red: string[] = JSON.parse(row.redCards)[level - 1];
    const slot = ['A','B','C'].find(s => safe ? !red.includes(s) : red.includes(s))!;
    return pickTowerCard(ownerId, attemptId, id(attemptId, level, slot), now);
  }
  const { owner, attempt } = await run();
  for (let level = 1; level <= 4; level++) { await pick(owner.id, attempt.attemptId, level, true); await continueTowerAttempt(owner.id, attempt.attemptId, level, now); }
  const loss = await pick(owner.id, attempt.attemptId, 5, false);
  assert.equal(loss.attempt.status, 'LOST'); assert.equal(loss.attempt.rewardAddedToVault, true);
  assert.equal(loss.attempt.securedReward?.name, '30 Minutes Gaming');
  await pick(owner.id, attempt.attemptId, 5, false);
  await Promise.all([claimTowerReward(owner.id, attempt.attemptId, now), claimTowerReward(owner.id, attempt.attemptId, now)]);
  assert.equal(await prisma.armoryTicket.count({ where: { source: 'TOWER', sourceRefId: attempt.attemptId } }), 1);
  const first = await run(); await pick(first.owner.id, first.attempt.attemptId, 1, false);
  assert.equal(await prisma.armoryTicket.count({ where: { sourceRefId: first.attempt.attemptId } }), 0);
  const legacy = await run(false); await pick(legacy.owner.id, legacy.attempt.attemptId, 1, true); await continueTowerAttempt(legacy.owner.id, legacy.attempt.attemptId, 1, now); await pick(legacy.owner.id, legacy.attempt.attemptId, 2, false);
  assert.equal(await prisma.armoryTicket.count({ where: { sourceRefId: legacy.attempt.attemptId } }), 0);
  const timed = await run(); await pick(timed.owner.id, timed.attempt.attemptId, 1, true); await continueTowerAttempt(timed.owner.id, timed.attempt.attemptId, 1, now);
  await assert.rejects(() => pickTowerCard(timed.owner.id, timed.attempt.attemptId, id(timed.attempt.attemptId, 2, 'A'), new Date(timed.attempt.runExpiresAt)), /TOWER_RUN_EXPIRED/);
  assert.equal(await prisma.armoryTicket.count({ where: { sourceRefId: timed.attempt.attemptId } }), 0);
});



test('personal reset copies isolate accounts, exclude future signups and recover atomically', async () => {
  const admin = await user(true), member = await user(), other = await user();
  await setting('guild_resets_enabled','true');
  const expectedAccounts = await prisma.user.count();
  const payload = { requestId: randomUUID(), action: 'BANK' as const, reason: 'Personal grant', expectedAccounts };
  const bank = await changeGuildReset(admin.id,payload,now);
  assert.equal(bank.affectedCount,expectedAccounts);
  assert.equal((await changeGuildReset(admin.id,payload,now)).grantId,bank.grantId);
  assert.equal(await prisma.guildReset.count({where:{grantId:bank.grantId}}),expectedAccounts);
  const later = await user();
  assert.equal(await prisma.guildReset.count({where:{grantId:bank.grantId,userId:later.id}}),0);
  assert.equal(later.happyAvailable,5);
  const own = await prisma.guildReset.findFirstOrThrow({where:{grantId:bank.grantId,userId:member.id}});
  const foreign = await prisma.guildReset.findFirstOrThrow({where:{grantId:bank.grantId,userId:other.id}});
  await assert.rejects(()=>activateBankedReset(other.id,{requestId:randomUUID(),resetId:own.id,version:0},now),/not available/);
  const activation={requestId:randomUUID(),resetId:own.id,version:member.happyVersion};
  const [first,replay]=await Promise.all([activateBankedReset(member.id,activation,now),activateBankedReset(member.id,activation,now)]);
  assert.deepEqual(first,replay);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:other.id}})).happyVersion,other.happyVersion);
  assert.equal((await prisma.guildReset.findUniqueOrThrow({where:{id:foreign.id}})).status,'PENDING');
  assert.equal(await prisma.rewardAudit.count({where:{resetId:own.id}}),1);
  await assert.rejects(()=>activateBankedReset(member.id,{...activation,version:1},now),/different action/);
  await changeGuildReset(admin.id,{requestId:randomUUID(),action:'CANCEL',reason:'Cancel unused copies',grantId:bank.grantId},now);
  assert.equal((await prisma.guildReset.findUniqueOrThrow({where:{id:own.id}})).status,'ACTIVATED');
  assert.equal((await prisma.guildReset.findUniqueOrThrow({where:{id:foreign.id}})).status,'CANCELLED');
  await assert.rejects(()=>changeGuildReset(admin.id,{requestId:randomUUID(),action:'BANK',reason:'Stale count',expectedAccounts},now),/account count changed/);
  const nextBank=await changeGuildReset(admin.id,{requestId:randomUUID(),action:'BANK',reason:'Concurrent copies'},now);
  const copies=await prisma.guildReset.findMany({where:{grantId:nextBank.grantId,userId:{in:[member.id,other.id]}}});
  const results=await Promise.allSettled(copies.map(async copy=>activateBankedReset(copy.userId!,{requestId:randomUUID(),resetId:copy.id,version:(await prisma.user.findUniqueOrThrow({where:{id:copy.userId!}})).happyVersion},now)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
  const expiredBank=await changeGuildReset(admin.id,{requestId:randomUUID(),action:'BANK',reason:'Expired copy'},now);
  const expired=await prisma.guildReset.findFirstOrThrow({where:{grantId:expiredBank.grantId,userId:member.id}});
  const latest=(await prisma.user.findUniqueOrThrow({where:{id:member.id}})).happyVersion;
  await assert.rejects(()=>activateBankedReset(member.id,{requestId:randomUUID(),resetId:expired.id,version:latest},next(40)),/expired/);
  await setting('guild_resets_enabled','false');
  await assert.rejects(()=>activateBankedReset(member.id,{requestId:randomUUID(),resetId:expired.id,version:latest},now),/paused/);
  await setting('guild_resets_enabled','true');
});

test('claim racing a personal reset preserves stock, cooldown and the other account', async () => {
  const admin = await user(true), owner = await user(), other = await user();
  const station = await prisma.station.create({ data: { name: 'Race PS5', specs: 'test', description: 'test', hourlyRate: 150 } });
  const pool = await readHappySettings();
  await configureHappyPool(admin.id, { stationIds: [station.id], days: [1,2,3,4,5], startTime: '16:00', endTime: '23:00' }, pool.version);
  await prisma.user.update({ where: { id: owner.id }, data: { happyAvailable: 1 } });
  const grant = await changeGuildReset(admin.id, { requestId: randomUUID(), action: 'BANK', reason: 'Race fixture' }, now);
  const copy = await prisma.guildReset.findFirstOrThrow({ where: { grantId: grant.grantId, userId: owner.id } });
  const results = await Promise.allSettled([
    claimHappyTicket(owner.id, randomUUID(), now),
    activateBankedReset(owner.id, { requestId: randomUUID(), resetId: copy.id, version: 0 }, now),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  const account = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
  assert.equal(account.happyAvailable, results[1].status === 'fulfilled' ? 4 : 0);
  assert.equal(account.happyLastClaimedAt?.toISOString(), now.toISOString());
  assert.equal(await prisma.happyTicket.count({ where: { userId: owner.id } }), 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).happyAvailable, 5);
  assert.equal((await prisma.guildReset.findUniqueOrThrow({ where: { id: copy.id } })).status, results[1].status === 'fulfilled' ? 'ACTIVATED' : 'PENDING');
});

test('User claim counters survive concurrent Spin, enforce limits, and skip duplicate audit writes', async () => {
  const admin = await user(true); const owner = await user();
  const station = await prisma.station.create({ data: { name: 'Counter PS5', description: 'fixture', specs: 'fixture', hourlyRate: 150 } });
  await readHappySettings();
  const pool = await readHappySettings();
  await setting('happy_tickets_enabled', 'true'); await setting('daily_spin_enabled', 'true'); await setting('legendary_pity_30_enabled', 'true');
  await configureHappyPool(admin.id, { stationIds: [station.id], days: [1,2,3,4,5], startTime: '16:00', endTime: '23:00' }, pool.version);
  const requestId = randomUUID();
  const [claim, spin] = await Promise.all([
    claimHappyTicket(owner.id, requestId, now),
    performDailySpin(owner.id, { requestId: randomUUID() }, now, () => 0),
  ]);
  let record = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
  assert.equal(record.happyLastClaimedAt?.toISOString(), now.toISOString());
  assert.equal(record.happyRateCount, 1);
  assert.equal(record.legendaryPity, spin.legendary.current);
  assert.equal(await prisma.rewardAudit.count({ where: { actorId: owner.id } }), 0);
  for (let attempt = 0; attempt < 9; attempt++) await assert.rejects(() => claimHappyTicket(owner.id, randomUUID(), now), /24 hours/);
  await assert.rejects(() => claimHappyTicket(owner.id, randomUUID(), now), /Too many attempts/);
  assert.equal((await claimHappyTicket(owner.id, requestId, now)).ticket.id, claim.ticket.id);
  record = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
  assert.equal(record.happyRateCount, 10);
  assert.equal(await prisma.happyTicket.count({ where: { userId: owner.id } }), 1);
  assert.equal(await prisma.rewardReceipt.count({ where: { actorId: owner.id, operation: 'HAPPY_CLAIM' } }), 1);
  await assert.rejects(() => claimHappyTicket(owner.id, randomUUID(), new Date(now.getTime() + 60_000)), /24 hours/);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).happyRateCount, 1);
});

test('internal ticket settings reject stale edits and admin lists are bounded and isolated', async () => {
  const admin = await user(true), member = await user();
  const station = await prisma.station.create({ data: { name: 'Settings PS5', description: 'fixture', specs: 'fixture', hourlyRate: 150 } });
  assert.deepEqual(parseHappySettings(JSON.stringify({version:0,config:{}})).config.stationIds,[]);
  const before = await readHappySettings();
  const rules = { stationIds: [station.id], days: [1,2,3,4,5], startTime: '16:00', endTime: '23:00' };
  const saved = await configureHappyPool(admin.id, rules, before.version);
  assert.equal(saved.version, before.version + 1);
  await assert.rejects(() => configureHappyPool(admin.id, rules, before.version), /Configuration changed/);
  await assert.rejects(() => configureHappyPool(member.id, rules, saved.version), /Forbidden/);
  assert.deepEqual((await readHappySettings()).config, rules);
  const tickets = await getAdminHappyTicketsReport(admin.id);
  assert.equal(tickets.section, 'tickets'); assert.ok(tickets.tickets.length <= 20);
  assert.deepEqual(tickets.members, []); assert.deepEqual(tickets.resets, []); assert.deepEqual(tickets.events, []);
  const members = await getAdminHappyTicketsReport(admin.id, new URLSearchParams({section:'members',search:member.email,userId:member.id}));
  assert.equal(members.members.length,1); assert.equal(members.member?.user.id,member.id); assert.deepEqual(members.tickets,[]);
  const empty = await getAdminHappyTicketsReport(admin.id,new URLSearchParams({section:'members',search:'nonexistent-unique-search'}));
  assert.equal(empty.members.length,0);
  await assert.rejects(() => getAdminHappyTicketsReport(member.id), /Forbidden/);
  for (const query of ['section=bad','page=0','page=1.5','page=100001','unknown=value']) await assert.rejects(() => getAdminHappyTicketsReport(admin.id,new URLSearchParams(query)));
});
