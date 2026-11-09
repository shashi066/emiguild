import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { getIstDateKey } from '../../lib/guess-36-clock';
import { grantGuessReviewBonus, getMineEligibility } from '../../lib/guess-36-bonuses';
import { revealMine, collectMine, getMineState } from '../../lib/guess-36-mines';
import { getVaultState } from '../../lib/lifecycle/server';
import { getVaultSummary } from '../../lib/lifecycle/summary';
import { selectVaultAction } from '../../lib/lifecycle/vault-presentation';
import { configureSpinSelection, mutateSpinItem, readSpinSelection, SPIN_SELECTION_KEY } from '../../lib/spin-selection';
import { performDailySpin, recoverDailySpin } from '../../lib/spin-rewards';
import { getSpinState } from '../../lib/daily-spin';
import { happyPoolState, claimHappyTicket, configureHappyPool, applyHappyTicket, restoreHappyTicket } from '../../lib/happy-tickets';
import { changeGuildReset, activateBankedReset } from '../../lib/guild-resets';
import { readHappySettings } from '../../lib/happy-config';
import { getAdminHappyTicketsReport } from '../../lib/admin-happy-tickets';
import { rewardTransaction } from '../../lib/november';

const url = process.env.DATABASE_URL ?? '';
if (url !== process.env.MINES_TEST_DATABASE_URL || !/mines[-_]test|emiguild_mines_/.test(url)) throw Error('Use an explicit disposable reward-updates database.');
after(() => prisma.$disconnect());
const now = new Date('2087-04-15T12:00:00+05:30');
const day = (n: number, clock = '12:00:00') => new Date(`2087-04-${String(n).padStart(2, '0')}T${clock}+05:30`);
const fixed = (max: number) => max - 1;
const setting = (key: string, value: string) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
const owner = (admin = false) => prisma.user.create({ data: { name: 'Reward updates fixture', email: `${randomUUID()}@example.test`, password: 'fixture', role: admin ? 'ADMIN' : 'USER', createdAt: now, happyBalanceDay: getIstDateKey(now) } });
const start = (userId: string, at = now, index = 5, requestId = randomUUID()) => revealMine(userId, { date: getIstDateKey(at), index, requestId }, at, fixed);

test('daily review grants are account scoped, idempotent, separate from Tower and pause safe', async () => {
  await setting('guess_36_mines_enabled', 'true');
  const u = await owner(), other = await owner();
  const grants = await Promise.all([1, 2, 3].map(() => grantGuessReviewBonus(u.id, '2087-04-15', now)));
  assert.equal(new Set(grants.map(grant => grant.id)).size, 1);
  assert.equal(grants.filter(grant => grant.created).length, 1);
  assert.equal(grants[0].expiresAt, '2087-04-16T18:30:00.000Z');
  assert.equal((await getMineEligibility(u.id, now)).bonuses.length, 1);
  assert.equal((await getMineEligibility(other.id, now)).bonuses.length, 0);
  assert.equal(await prisma.towerToken.count({ where: { userId: u.id } }), 0);
  await setting('guess_36_mines_enabled', 'false');
  assert.equal((await grantGuessReviewBonus(u.id, '2087-04-15', day(16))).id, grants[0].id, 'old grant recovery never extends expiry');
  await assert.rejects(() => grantGuessReviewBonus(other.id, '2087-04-15', now), /paused/);
  await setting('guess_36_mines_enabled', 'true');
  await assert.rejects(() => grantGuessReviewBonus(other.id, '2087-04-14', now), /new day/);
  await assert.rejects(() => grantGuessReviewBonus(other.id, '2087-02-31', now), /Invalid/);
});

test('free first, oldest bonus next: carryover permits exactly three runs, never a fourth', async () => {
  const u = await owner();
  const yesterday = await grantGuessReviewBonus(u.id, '2087-04-15', now);
  const today = await grantGuessReviewBonus(u.id, '2087-04-16', day(16));
  const firstId = randomUUID();
  const first = await start(u.id, day(16), 5, firstId); assert.equal(first.status, 'LOST');
  const second = await start(u.id, day(16)); const third = await start(u.id, day(16));
  const rows = await prisma.guess36Entry.findMany({ where: { userId: u.id }, orderBy: { id: 'asc' } });
  assert.equal(rows.find(row => row.id === first.id)?.attemptKey, 'FREE');
  assert.equal(rows.find(row => row.id === second.id)?.reviewReceiptId, yesterday.id);
  assert.equal(rows.find(row => row.id === third.id)?.reviewReceiptId, today.id);
  await assert.rejects(() => start(u.id, day(16)), /already played/);
  assert.equal((await start(u.id, day(17), 5, randomUUID())).date, '2087-04-17');
  const replay = await revealMine(u.id, { date: '2087-04-16', index: 5, requestId: firstId }, day(17), fixed);
  assert.equal(replay.id, first.id);
  await assert.rejects(() => revealMine(u.id, { date: '2087-04-16', index: 6, requestId: firstId }, day(17), fixed), /different action/);
  const recovered = await getMineState(u.id, day(17), undefined, undefined, firstId);
  assert.equal(recovered.run?.id, first.id);
  const stranger = await owner();
  await assert.rejects(() => getMineState(stranger.id, day(17), undefined, undefined, firstId), /No committed/);
});

test('unrelated and local test receipts never grant playable bonuses', async () => {
  const u = await owner();
  await prisma.rewardReceipt.create({ data: {
    actorId: u.id, operation: 'GUESS36_TEST_GRANT', requestId: randomUUID(),
    fingerprint: 'local-only', response: JSON.stringify({ expiresAt: day(17).toISOString() }),
  } });
  assert.equal((await getMineEligibility(u.id, now)).bonuses.length, 0);
  await start(u.id);
  await assert.rejects(() => start(u.id), /already played/);
});

test('first-pick loss duplicates cannot spend a bonus; concurrent devices cannot create two active runs', async () => {
  const u = await owner(); await grantGuessReviewBonus(u.id, '2087-04-15', now);
  const id = randomUUID();
  const results = await Promise.all([1, 2, 3].map(() => start(u.id, now, 5, id)));
  assert.equal(new Set(results.map(run => run.id)).size, 1);
  assert.equal((await getMineEligibility(u.id, now)).bonuses.length, 1);
  const active = await Promise.all([start(u.id, now, 0), start(u.id, now, 1)]);
  assert.equal(new Set(active.map(run => run.id)).size, 1);
  assert.equal(await prisma.guess36Entry.count({ where: { userId: u.id, mineStatus: 'ACTIVE' } }), 1);
  assert.equal(active[0].tiles.length, 1);
  assert.doesNotMatch(JSON.stringify(await getMineState(u.id, now)), /mineBoard|mineRules|password/);
});

test('bonus start expiry does not truncate a started 90-second run; legacy FREE still permits bonuses', async () => {
  const u = await owner(); const grant = await grantGuessReviewBonus(u.id, '2087-04-15', now);
  await start(u.id, day(16));
  const run = await start(u.id, day(16, '23:59:40'), 0);
  assert.ok(Date.parse(run.expiresAt) > Date.parse(grant.expiresAt));
  const result = await revealMine(u.id, { date: run.date, index: 1, runId: run.id, version: run.version }, day(17, '00:00:10'));
  assert.equal(result.greens, 2);
  assert.equal((await collectMine(u.id, { runId: run.id, version: result.version }, day(17, '00:00:11'))).reward?.value, 30);
  const unused = await owner(); await grantGuessReviewBonus(unused.id, '2087-04-15', now);
  assert.equal((await getMineEligibility(unused.id, day(17, '00:00:00'))).bonuses.length, 0);
  const legacy = await owner();
  const round = await prisma.guess36Round.findUniqueOrThrow({ where: { roundDate: '2087-04-15' } });
  await prisma.guess36Entry.create({ data: { userId: legacy.id, roundId: round.id, selectionType: 'NUMBER', selectionValue: 1 } });
  await grantGuessReviewBonus(legacy.id, '2087-04-15', now);
  const bonus = await start(legacy.id);
  assert.match((await prisma.guess36Entry.findUniqueOrThrow({ where: { id: bonus.id } })).attemptKey, /^REVIEW:/);
});

test('Vault presents bonus eligibility, prioritizes active Expedition and includes a timeout ticket immediately', async () => {
  const u = await owner();
  await Promise.all(['daily_spin_enabled', 'tower_enabled', 'armory_enabled'].map(key => setting(key, 'false')));
  await grantGuessReviewBonus(u.id, '2087-04-15', now);
  const run = await start(u.id, now, 0);
  const active = await getVaultState(u.id, now);
  assert.equal(selectVaultAction(active.games, now)?.label, 'Resume Expedition');
  assert.equal(active.games.find(game => game.id === 'guess36')?.facts?.expedition?.bonuses.length, 1);
  assert.match(active.games.find(game => game.id === 'guess36')!.details.join(' '), /Next expires .*end of day.*IST/);
  assert.equal((await getVaultSummary(u.id, now)).pendingCount, 1);
  const finished = await getVaultState(u.id, new Date(now.getTime() + 91_000));
  const ticket = await prisma.armoryTicket.findUniqueOrThrow({ where: { source_sourceRefId: { source: 'GUESS_36', sourceRefId: run.id } } });
  assert.equal(finished.items.filter(item => item.sourceRef === `ArmoryTicket:${ticket.id}`).length, 1);
  assert.equal((await getVaultSummary(u.id, now)).pendingCount, 1, 'tokens and rewards share one actionable destination');
  assert.ok(!JSON.stringify(finished).includes('Happy Ticket'));
  await setting('armory_enabled', 'true');
});

async function spinSetup() {
  const admin = await owner(true);
  const previous = await readSpinSelection();
  await configureSpinSelection(admin.id, { ...previous, enabled: false });
  await prisma.lootItem.updateMany({ data: { enabled: false } });
  await setting('daily_spin_enabled', 'true'); await setting('legendary_pity_30_enabled', 'true'); await setting('daily_spin_reset_hour', '0');
  const suffix = randomUUID();
  const common = await prisma.lootItem.create({ data: { id: `a-${suffix}`, name: 'Common fixture', rarity: 'COMMON', weight: 100 } });
  const selected = await prisma.lootItem.create({ data: { id: `b-${suffix}`, name: 'Featured fixture', rarity: 'RARE', weight: 10 } });
  const epic = await prisma.lootItem.create({ data: { id: `c-${suffix}`, name: 'Epic fixture', rarity: 'EPIC', weight: 5 } });
  const legendary = await prisma.lootItem.create({ data: { id: `d-${suffix}`, name: 'Legendary fixture', rarity: 'LEGENDARY', weight: 1 } });
  return { admin, common, selected, epic, legendary };
}
test('selected ordinary reward is shared, snapshotted, recoverable and disabled by default', async () => {
  const { admin, selected, common } = await spinSetup(); const u = await owner();
  assert.equal((await readSpinSelection()).enabled, false);
  assert.equal((await performDailySpin(u.id, {}, now, () => 0)).reward.id, common.id);
  const config = await configureSpinSelection(admin.id, { enabled: true, itemId: selected.id, version: (await readSpinSelection()).version });
  const rid = randomUUID();
  const result = await performDailySpin(u.id, { requestId: rid }, day(16), () => { throw Error('Ordinary override must not roll'); });
  assert.equal(result.reward.id, selected.id); assert.equal(result.guaranteeReason, 'ADMIN_SELECTED');
  assert.equal((await getSpinState(u.id, day(16))).featuredReward?.id, selected.id);
  await mutateSpinItem(admin.id, selected.id, { name: 'Edited later' });
  await configureSpinSelection(admin.id, { ...config, enabled: false });
  assert.equal((await recoverDailySpin(u.id, rid)).reward.name, 'Featured fixture');
  assert.equal((await getSpinState(u.id, day(16))).spin?.lootItem?.name, 'Featured fixture');
});
test('Legendary then Epic guarantees override the selection; actual rarity resets the right counters', async () => {
  const { admin, selected, common, epic, legendary } = await spinSetup();
  await configureSpinSelection(admin.id, { enabled: true, itemId: selected.id, version: (await readSpinSelection()).version });
  for (const dueLegendary of [false, true]) {
    const u = await owner();
    for (let d = 6; d <= 14; d++) await prisma.userDailySpin.create({ data: { userId: u.id, spinDate: `2087-04-${String(d).padStart(2, '0')}`, lootItemId: common.id, awardedRarity: 'COMMON' } });
    await prisma.user.update({ where: { id: u.id }, data: { legendaryPity: dueLegendary ? 29 : 9 } });
    const result = await performDailySpin(u.id, {}, now, () => 0);
    assert.equal(result.reward.id, dueLegendary ? legendary.id : epic.id);
    assert.equal(result.legendary.current, dueLegendary ? 0 : 10); assert.equal(result.streak.current, 0);
  }
  const u = await owner();
  for (const item of [epic, legendary]) {
    const selection = await readSpinSelection(); await configureSpinSelection(admin.id, { ...selection, itemId: item.id });
    const result = await performDailySpin(u.id, {}, item.id === epic.id ? day(16) : day(17), () => 0);
    assert.equal(result.streak.current, 0); assert.equal(result.legendary.current, item.id === epic.id ? 1 : 0);
  }
});
test('invalid pools and selections consume nothing; stale or demoted admins and selected-item invalidation are rejected', async () => {
  const { admin, selected, epic, common } = await spinSetup(); const u = await owner();
  const before = await readSpinSelection();
  const configured = await configureSpinSelection(admin.id, { enabled: true, itemId: selected.id, version: before.version });
  await assert.rejects(() => configureSpinSelection(admin.id, { ...before, enabled: true, itemId: selected.id }), /changed/);
  for (const change of [{ enabled: false }, { weight: 0 }]) await assert.rejects(() => mutateSpinItem(admin.id, selected.id, change), /Disable/);
  await assert.rejects(() => mutateSpinItem(admin.id, selected.id, null, true), /Disable/);
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } });
  await assert.rejects(() => configureSpinSelection(admin.id, { ...configured, enabled: false }), /Forbidden/);
  await assert.rejects(() => mutateSpinItem(admin.id, common.id, { weight: 0 }), /Forbidden/);
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  await setting(SPIN_SELECTION_KEY, JSON.stringify({ ...configured, itemId: 'missing' }));
  await assert.rejects(() => performDailySpin(u.id, {}, now), /featured reward/);
  assert.equal(await prisma.userDailySpin.count({ where: { userId: u.id } }), 0);
  await setting(SPIN_SELECTION_KEY, JSON.stringify(configured));
  await prisma.lootItem.update({ where: { id: epic.id }, data: { enabled: false } });
  for (let d = 6; d <= 14; d++) await prisma.userDailySpin.create({ data: { userId: u.id, spinDate: `2087-04-${String(d).padStart(2, '0')}`, lootItemId: common.id, awardedRarity: 'COMMON' } });
  await assert.rejects(() => performDailySpin(u.id, {}, now), /Epic rewards/);
  assert.equal(await prisma.userDailySpin.count({ where: { userId: u.id, spinDate: '2087-04-15' } }), 0);
  await configureSpinSelection(admin.id, { ...configured, enabled: false });
});
test('selection activation races item disabling without producing an invalid active selection', async () => {
  const { admin, selected } = await spinSetup();
  await Promise.allSettled([
    configureSpinSelection(admin.id, { enabled: true, itemId: selected.id, version: (await readSpinSelection()).version }),
    mutateSpinItem(admin.id, selected.id, { enabled: false }),
  ]);
  const config = await readSpinSelection(), item = await prisma.lootItem.findUniqueOrThrow({ where: { id: selected.id } });
  assert.ok(!config.enabled || item.enabled && item.weight > 0);
  await configureSpinSelection(admin.id, { ...config, enabled: false });
});

async function happySetup() {
  const admin = await owner(true), u = await owner();
  const station = await prisma.station.create({ data: { name: 'Reward fixture PS5', description: 'fixture', specs: 'fixture', hourlyRate: 150 } });
  await setting('happy_tickets_enabled', 'true'); await setting('guild_resets_enabled', 'true');
  await configureHappyPool(admin.id, { stationIds: [station.id], days: [0, 1, 2, 3, 4, 5, 6], startTime: '16:00', endTime: '23:00' }, (await readHappySettings()).version);
  return { admin, u, station };
}
test('Happy balance expires lazily, claims count once, receipts stay immutable and admin reads agree', async () => {
  const { admin, u } = await happySetup();
  const request = randomUUID(), claim = await claimHappyTicket(u.id, request, now);
  assert.equal(claim.available, 4);
  assert.equal((await happyPoolState(u.id, day(16))).available, 4);
  assert.equal((await happyPoolState(u.id, day(17))).available, 3);
  assert.equal((await happyPoolState(u.id, day(25))).available, 0);
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: u.id } }); assert.equal(stored.happyAvailable, 4);
  assert.equal((await claimHappyTicket(u.id, request, day(25))).available, 4, 'receipt preserves committed response');
  const report = await getAdminHappyTicketsReport(admin.id, new URLSearchParams({ section: 'members', userId: u.id, search: u.email }), day(17));
  assert.equal(report.member?.available, 3); assert.equal(report.members[0].happyAvailable, 3);
  assert.equal(await prisma.happyTicket.count({ where: { userId: u.id } }), 1, 'unclaimed expiry never fabricates ticket rows');
  await claimHappyTicket(u.id, randomUUID(), day(17));
  assert.equal((await happyPoolState(u.id, day(17))).available, 2);
});
test('refills use projected versions, reject stale ones and preserve earlier same-day claims', async () => {
  const { admin, u } = await happySetup(); await claimHappyTicket(u.id, randomUUID(), now);
  const old = await happyPoolState(u.id, now);
  await changeGuildReset(admin.id, { requestId: randomUUID(), action: 'BANK', reason: 'Fixture reset' }, day(17));
  const bank = (await happyPoolState(u.id, day(17))).banked.next!;
  await assert.rejects(() => activateBankedReset(u.id, { requestId: randomUUID(), resetId: bank.id, version: old.version }, day(17)), /changed/);
  const latest = await happyPoolState(u.id, day(17));
  await activateBankedReset(u.id, { requestId: randomUUID(), resetId: bank.id, version: latest.version }, day(17));
  assert.equal((await happyPoolState(u.id, day(17))).available, 5);
  assert.equal((await happyPoolState(u.id, day(18))).available, 4);
  await claimHappyTicket(u.id, randomUUID(), day(18));
  await changeGuildReset(admin.id, { requestId: randomUUID(), action: 'FORCE', reason: 'Refill after claim' }, day(18));
  assert.equal((await happyPoolState(u.id, day(19))).available, 5);
});
test('Happy claim/reset contention and booking cancellation do not overspend, alter cooldown or refill stock', async () => {
  const { admin, u, station } = await happySetup();
  await prisma.user.update({ where: { id: u.id }, data: { happyAvailable: 1 } });
  const races = await Promise.allSettled([claimHappyTicket(u.id, randomUUID(), now), claimHappyTicket(u.id, randomUUID(), now), changeGuildReset(admin.id, { requestId: randomUUID(), action: 'FORCE', reason: 'Concurrent refill' }, now)]);
  assert.equal(races.filter(result => result.status === 'fulfilled').length, 2);
  const ticket = await prisma.happyTicket.findFirstOrThrow({ where: { userId: u.id } });
  const before = await happyPoolState(u.id, now);
  assert.ok([4, 5].includes(before.available));
  await assert.rejects(() => claimHappyTicket(u.id, randomUUID(), now), /24 hours/);
  const booking = await rewardTransaction(async tx => {
    const discount = await applyHappyTicket(tx, { ticketId: ticket.id, userId: u.id, stationId: station.id, date: '2087-04-15', startTime: '16:00', duration: 1 }, now);
    const booking = await tx.booking.create({ data: { userId: u.id, stationId: station.id, date: '2087-04-15', startTime: '16:00', endTime: '17:00', duration: 1, totalPrice: 0 } });
    await tx.happyRedemption.create({ data: { ticketId: ticket.id, bookingId: booking.id, activeBookingId: booking.id, activeTicketId: ticket.id, discount } });
    return booking;
  });
  await rewardTransaction(tx => restoreHappyTicket(tx, booking.id, now));
  await rewardTransaction(tx => restoreHappyTicket(tx, booking.id, now));
  const restored = await prisma.happyTicket.findUniqueOrThrow({ where: { id: ticket.id } });
  assert.equal(restored.status, 'CLAIMED'); assert.equal(restored.expiresAt.getTime(), ticket.expiresAt.getTime());
  assert.equal((await happyPoolState(u.id, now)).available, before.available);
  assert.equal(await prisma.happyRedemption.count({ where: { ticketId: ticket.id } }), 1);
});
