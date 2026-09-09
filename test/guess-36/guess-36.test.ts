import assert from 'node:assert/strict';
import test, { after, before, mock } from 'node:test';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { GET as runScheduledDraw } from '../../app/api/cron/guess-36/draw/route';
import { prisma } from '../../lib/prisma';
import { redeemArmoryTicket } from '../../lib/armory';
import { getEmicRewards, purchaseEmicReward } from '../../lib/emic-rewards';
import { EMIC_UNIT_FACTOR } from '../../lib/emic';
import { addIstDateDays, getGuess36EntryCutoff, getIstMidnight } from '../../lib/guess-36-clock';
import { DEFAULT_GUESS_36_MODES, DEFAULT_GUESS_36_REWARDS, normalizeGuess36Modes } from '../../lib/guess-36-rules';
import type { Guess36Selection } from '../../lib/guess-36-types';
import {
  createGuess36Entry, drawGuess36Round, ensureGuess36Config, getGuess36AdminData,
  getGuess36Config, getGuess36Current, Guess36Error, redeemGuess36Ticket, updateGuess36Config,
} from '../../lib/guess-36';

const keys = ['guess_36_enabled', 'guess_36_rewards', 'guess_36_modes'];
const users: { id: string; role: string }[] = [];
let savedSettings: { key: string; value: string; label: string | null }[] = [];
let baseDate = '2081-01-01';
const day = (offset: number) => addIstDateDays(baseDate, offset);
const time = (offset: number) => new Date(getIstMidnight(day(offset)).getTime() + 12 * 60 * 60 * 1000);
const enter = (user: number, selection: Guess36Selection, offset: number) => createGuess36Entry(users[user].id, { roundDate: day(offset), selection }, time(offset));
const errorCode = (code: string) => (error: unknown) => error instanceof Guess36Error && error.code === code;

before(async () => {
  savedSettings = await prisma.setting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true, label: true } });
  while (await prisma.guess36Round.count({ where: { roundDate: { gte: baseDate, lte: day(40) } } })) baseDate = addIstDateDays(baseDate, 42);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  for (let index = 0; index < 8; index += 1) users.push(await prisma.user.create({ data: {
    name: `Guess${index} Player`, email: `guess36-${suffix}-${index}@example.com`, password: 'not-a-login',
    role: index === 4 ? 'ADMIN' : 'USER', phone: `987650000${index}`,
  } }));
  await ensureGuess36Config();
  await prisma.setting.update({ where: { key: keys[0] }, data: { value: 'true' } });
  await prisma.setting.update({ where: { key: keys[1] }, data: { value: JSON.stringify(DEFAULT_GUESS_36_REWARDS) } });
  await prisma.setting.update({ where: { key: keys[2] }, data: { value: JSON.stringify(DEFAULT_GUESS_36_MODES) } });
});

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await prisma.guess36Round.deleteMany({ where: { roundDate: { gte: baseDate, lte: day(40) } } });
  for (const key of keys) {
    const setting = savedSettings.find((candidate) => candidate.key === key);
    if (setting) await prisma.setting.upsert({ where: { key }, update: setting, create: setting });
    else await prisma.setting.deleteMany({ where: { key } });
  }
  await prisma.$disconnect();
});

test('current choices and legacy rows match draws while each winner receives their tier reward', async () => {
  const choices: Guess36Selection[] = [
    { type: 'NUMBER', value: 35 }, { type: 'ODD' }, { type: 'RANGE', value: 3 }, { type: 'ROW', value: 2 },
    { type: 'NUMBER', value: 35 }, { type: 'EVEN' }, { type: 'RANGE', value: 1 }, { type: 'ROW', value: 3 },
  ];
  for (let i = 0; i < choices.length; i += 1) {
    const choice = choices[i];
    if (choice.type !== 'ROW') {
      await enter(i, choice, 0);
      continue;
    }
    const round = await prisma.guess36Round.findUniqueOrThrow({ where: { roundDate: day(0) } });
    await prisma.guess36Entry.create({ data: {
      roundId: round.id,
      userId: users[i].id,
      selectionType: 'ROW',
      selectionValue: choice.value,
    } });
  }
  await assert.rejects(() => enter(0, { type: 'EVEN' }, 0), (error: unknown) => error instanceof Guess36Error
    && error.code === 'ALREADY_ENTERED' && JSON.stringify(error.existingEntry?.selection) === JSON.stringify(choices[0]));
  const pending = await getGuess36Current(users[4], time(0));
  assert.equal(pending.eligible, true);
  assert.deepEqual(pending.today.entry?.selection, choices[4]);
  assert.equal(pending.previous.winningNumber, null);
  const draw = await drawGuess36Round(day(0), time(1), { randomInt: (min, max) => { assert.equal(min, 1); assert.equal(max, 37); return 35; } });
  assert.equal(draw.winnerCount, 5);
  assert.deepEqual(await drawGuess36Round(day(0), time(1), { randomInt: () => 12 }), draw);
  const tickets = await prisma.armoryTicket.findMany({ where: { userId: { in: users.map((user) => user.id) } } });
  assert.equal(tickets.length, 5);
  assert.equal(new Set(tickets.map((ticket) => ticket.sourceRefId)).size, 5);
  for (let index = 0; index < choices.length; index += 1) {
    const state = await getGuess36Current(users[index], time(1));
    assert.equal(state.previous.outcome, index < 5 ? 'WIN' : 'LOSS');
    assert.deepEqual(state.previous.myPick, choices[index]);
    if (index < 5) {
      const ticket = state.rewardTickets[0];
      assert.equal(ticket.reward.value, [60, 10, 15, 15, 60][index]);
      assert.equal(ticket.expiresAt, getIstMidnight(day(2)).toISOString());
      assert.deepEqual(state.previous.reward, ticket.reward);
      assert.deepEqual(Object.keys(ticket).sort(), ['expiresAt', 'id', 'reward']);
    } else { assert.equal(state.previous.reward, null); assert.deepEqual(state.rewardTickets, []); }
    for (const key of ['code', 'sourceRefId', 'rewardsSnapshot', 'selectionValue', 'phone', 'email']) assert.equal(JSON.stringify(state).includes(key), false);
    assert.ok(Buffer.byteLength(JSON.stringify(state)) < 4000);
  }
  const admin = await getGuess36AdminData({ roundDate: day(0), view: 'winners', take: 2, now: time(1) });
  assert.equal(admin.round.winnerCount, 5);
  assert.equal(admin.items.length, 2);
  assert.ok(admin.nextCursor);
  const next = await getGuess36AdminData({ roundDate: day(0), view: 'winners', take: 2, cursor: admin.nextCursor!, now: time(1) });
  assert.equal(next.items.length, 2);
  assert.equal(next.items.some((item) => admin.items.some((first) => first.id === item.id)), false);
  assert.ok(admin.items.every((item) => item.phone.startsWith('****') && item.ticket?.reward.name === item.reward.name));
  assert.ok(admin.items.every((item) => /^G36-[A-F0-9]{18}$/.test(item.ticket!.code) && item.ticket!.status === 'UNUSED'));
  assert.equal((await getGuess36AdminData({ roundDate: day(0), take: NaN, now: time(1) })).items.length, 8);
  const deadline = getIstMidnight(day(2));
  assert.equal((await redeemArmoryTicket(tickets[0].id, new Date(deadline.getTime() - 1))).status, 'REDEEMED');
  assert.equal((await redeemGuess36Ticket(tickets[0].id, deadline)).status, 'REDEEMED');
  await assert.rejects(() => redeemGuess36Ticket(tickets[1].id, deadline), errorCode('TICKET_EXPIRED'));
  assert.ok((await redeemGuess36Ticket(tickets[2].id, time(1))).reward.name);
});

test('concurrent first entries, duplicate submissions, and draws remain atomic', async () => {
  const entry = { roundDate: day(3), selection: { type: 'EVEN' as const } };
  const results = await Promise.allSettled([
    createGuess36Entry(users[0].id, entry, time(3)), createGuess36Entry(users[0].id, entry, time(3)),
    createGuess36Entry(users[1].id, entry, time(3)),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
  assert.equal((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason.code, 'ALREADY_ENTERED');
  const draws = await Promise.all([
    drawGuess36Round(day(3), time(4), { randomInt: () => 2 }),
    drawGuess36Round(day(3), time(4), { randomInt: () => 4 }),
  ]);
  assert.equal(draws[0].winningNumber, draws[1].winningNumber);
  assert.equal(draws[0].winnerCount, 2);
  const round = await prisma.guess36Round.findUniqueOrThrow({ where: { roundDate: day(3) }, include: { entries: true } });
  assert.equal(await prisma.armoryTicket.count({ where: { source: 'GUESS_36', sourceRefId: { in: round.entries.map((entry) => entry.id) } } }), 2);
});

test('rejects stale days, forged choices, missing users, and paused entries', async () => {
  await assert.rejects(() => createGuess36Entry(users[0].id, { roundDate: day(4), selection: { type: 'EVEN' } }, time(5)), errorCode('STALE_ROUND'));
  for (const selection of [{ type: 'NUMBER', value: 37 }, { type: 'EVEN', value: 2 }, [{ type: 'ODD' }, { type: 'RANGE', value: 1 }], { type: 'ROW', value: 1 }, { type: 'ROW', value: 4 }]) {
    await assert.rejects(() => createGuess36Entry(users[0].id, { roundDate: day(5), selection }, time(5)), errorCode('INVALID_SELECTION'));
  }
  await assert.rejects(() => createGuess36Entry('missing-account', { roundDate: day(5), selection: { type: 'EVEN' } }, time(5)), errorCode('PLAYER_ONLY'));
  await enter(0, { type: 'EVEN' }, 5);
  await updateGuess36Config({ enabled: false }, time(5));
  await assert.rejects(() => enter(1, { type: 'ODD' }, 5), errorCode('GUESS_36_DISABLED'));
  const paused = await getGuess36Current(users[0], time(5));
  assert.equal(paused.today.status, 'PAUSED');
  assert.deepEqual(paused.today.entry?.selection, { type: 'EVEN' });
  assert.equal((await drawGuess36Round(day(5), time(6), { randomInt: () => 2 })).winnerCount, 1);
  await updateGuess36Config({ enabled: true }, time(6));
  await assert.rejects(() => drawGuess36Round(day(6), time(6)), errorCode('DRAW_NOT_AVAILABLE'));
  await assert.rejects(() => drawGuess36Round('not-a-date', time(6)), errorCode('INVALID_ROUND_DATE'));
});

test('admin pick types are normalized and enforced for new entries', async () => {
  assert.deepEqual(normalizeGuess36Modes(['RANGE', 'NUMBER']), ['NUMBER', 'RANGE']);
  for (const modes of [[], ['NUMBER', 'NUMBER'], ['ROW'], ['NUMBER', 'ROW'], 'NUMBER']) {
    assert.throws(() => normalizeGuess36Modes(modes));
  }
  const config = await updateGuess36Config({ enabledModes: ['PARITY'] }, time(2));
  assert.deepEqual(config.enabledModes, ['PARITY']);
  assert.deepEqual((await getGuess36Current(users[0], time(2))).enabledModes, ['PARITY']);
  await assert.rejects(() => enter(0, { type: 'NUMBER', value: 7 }, 2), errorCode('MODE_DISABLED'));
  assert.deepEqual((await enter(0, { type: 'EVEN' }, 2)).selection, { type: 'EVEN' });
  await assert.rejects(() => updateGuess36Config({ enabledModes: [] }, time(2)), errorCode('INVALID_MODES'));
  await updateGuess36Config({ enabledModes: DEFAULT_GUESS_36_MODES }, time(2));
});

test('reward changes start next IST round and snapshots survive later edits', async () => {
  const rewards = { EXACT: { type: 'PASS', name: 'Weekend Hero Pass' }, GROUP: { type: 'RACING_TIME', value: 30 }, PARITY: { type: 'DISCOUNT', value: 10 } };
  const config = await updateGuess36Config({ rewards }, time(7));
  assert.equal(config.effectiveFrom, day(8));
  assert.deepEqual(config.todayRewards, DEFAULT_GUESS_36_REWARDS);
  assert.equal(config.rewards.EXACT.name, 'Weekend Hero Pass');
  assert.equal((await getGuess36Current(users[0], time(7))).today.rewards.EXACT.value, 60);
  await enter(0, { type: 'NUMBER', value: 12 }, 7);
  await enter(0, { type: 'NUMBER', value: 12 }, 8);
  await enter(1, { type: 'RANGE', value: 1 }, 8);
  await enter(2, { type: 'EVEN' }, 8);
  const snapshot = await prisma.guess36Round.findUniqueOrThrow({ where: { roundDate: day(8) } });
  await updateGuess36Config({ rewards: DEFAULT_GUESS_36_REWARDS }, time(8));
  assert.equal((await prisma.guess36Round.findUniqueOrThrow({ where: { roundDate: day(8) } })).rewardsSnapshot, snapshot.rewardsSnapshot);
  await drawGuess36Round(day(7), time(8), { randomInt: () => 12 });
  await drawGuess36Round(day(8), time(9), { randomInt: () => 12 });
  assert.equal((await getGuess36Current(users[0], time(8))).previous.reward?.value, 60);
  assert.deepEqual((await getGuess36Current(users[0], time(9))).previous.reward, { type: 'PASS', name: 'Weekend Hero Pass' });
  assert.equal((await getGuess36Current(users[1], time(9))).previous.reward?.name, '30 Minutes Racing');
  assert.equal((await getGuess36Current(users[2], time(9))).previous.reward?.name, '10% Booking Discount');
  assert.equal((await getGuess36Config(time(9))).todayRewards.EXACT.value, 60);
});

test('legacy numeric entries and already-created ticket descriptions remain readable', async () => {
  const round = await prisma.guess36Round.create({ data: { roundDate: day(10) } });
  const entry = await prisma.guess36Entry.create({ data: { roundId: round.id, userId: users[0].id, selectionValue: 35 } });
  assert.deepEqual((await getGuess36Current(users[0], time(10))).today.entry?.selection, { type: 'NUMBER', value: 35 });
  assert.ok((await prisma.guess36Round.findUniqueOrThrow({ where: { id: round.id } })).rewardsSnapshot);
  await drawGuess36Round(day(10), time(11), { randomInt: () => 35 });
  await prisma.armoryTicket.update({ where: { source_sourceRefId: { source: 'GUESS_36', sourceRefId: entry.id } }, data: {
    rewardSnapshot: JSON.stringify({ rewardType: 'GAMING_MINUTES', gamingMinutes: 60, description: '1 Free Hour of Gaming' }),
  } });
  const state = await getGuess36Current(users[0], time(11));
  assert.equal(state.previous.reward?.name, '60 Minutes Gaming');
  assert.equal(state.rewardTickets[0].reward.name, '1 Free Hour of Gaming');
  assert.equal((await prisma.guess36Entry.findUniqueOrThrow({ where: { id: entry.id } })).selectionValue, 35);
});

test('IST midnight changes the accepted round and empty draws are final', async () => {
  const midnight = getIstMidnight(day(13));
  await createGuess36Entry(users[0].id, { roundDate: day(12), selection: { type: 'ODD' } }, new Date(midnight.getTime() - 5 * 60 * 1000 - 1));
  await assert.rejects(() => createGuess36Entry(users[1].id, { roundDate: day(12), selection: { type: 'ODD' } }, midnight), errorCode('STALE_ROUND'));
  assert.deepEqual((await createGuess36Entry(users[0].id, { roundDate: day(13), selection: { type: 'EVEN' } }, midnight)).selection, { type: 'EVEN' });
  const drawn = await drawGuess36Round(day(14), time(15), { randomInt: () => 36 });
  assert.equal(drawn.winnerCount, 0);
  assert.equal(drawn.winningNumber, 36);
  assert.equal((await drawGuess36Round(day(14), time(15), { randomInt: () => 1 })).winningNumber, 36);
});

test('entries close exactly five minutes before IST midnight across player and admin reads', async () => {
  const midnight = getIstMidnight(day(16));
  const cutoff = getGuess36EntryCutoff(new Date(midnight.getTime() - 60 * 60 * 1000));
  const beforeCutoff = new Date(cutoff.getTime() - 1);
  assert.equal(cutoff.getTime(), midnight.getTime() - 5 * 60 * 1000);

  const open = await getGuess36Current(users[6], beforeCutoff);
  assert.equal(open.today.status, 'OPEN');
  assert.equal(open.today.entryClosesAt, cutoff.toISOString());
  await createGuess36Entry(users[6].id, { roundDate: day(15), selection: { type: 'NUMBER', value: 8 } }, beforeCutoff);

  await assert.rejects(
    () => createGuess36Entry(users[7].id, { roundDate: day(15), selection: { type: 'EVEN' } }, cutoff),
    errorCode('ROUND_CLOSED'),
  );
  const closed = await getGuess36Current(users[7], cutoff);
  assert.equal(closed.today.status, 'CLOSED');
  assert.equal(closed.today.entry, null);
  assert.deepEqual((await getGuess36Current(users[6], cutoff)).today.entry?.selection, { type: 'NUMBER', value: 8 });
  assert.equal((await getGuess36AdminData({ roundDate: day(15), now: cutoff })).summary.today.status, 'CLOSED');
  assert.equal((await getGuess36Current(users[7], midnight)).today.status, 'OPEN');
});

test('seeding preserves rewards and ordinary reads do not rewrite rounds or settings', async () => {
  const rewards = { ...DEFAULT_GUESS_36_REWARDS, EXACT: { type: 'PASS', name: 'Saved Pass' } };
  await updateGuess36Config({ rewards }, time(16));
  await ensureGuess36Config();
  assert.equal((await getGuess36Config(time(16))).rewards.EXACT.name, 'Saved Pass');
  const before = await prisma.guess36Round.findUniqueOrThrow({ where: { roundDate: day(16) } });
  const settings = await prisma.setting.findMany({ where: { key: { in: keys } }, orderBy: { key: 'asc' } });
  await getGuess36Current(users[0], time(16));
  await getGuess36Current(null, time(16));
  assert.deepEqual(await prisma.guess36Round.findUniqueOrThrow({ where: { roundDate: day(16) } }), before);
  assert.deepEqual(await prisma.setting.findMany({ where: { key: { in: keys } }, orderBy: { key: 'asc' } }), settings);
  await prisma.setting.delete({ where: { key: 'guess_36_rewards' } });
  await ensureGuess36Config();
  assert.deepEqual((await getGuess36Config(time(17))).rewards, DEFAULT_GUESS_36_REWARDS);
});

test('ticket-code collisions roll back the whole draw and can be retried safely', async () => {
  const mixedRewards = {
    ...DEFAULT_GUESS_36_REWARDS,
    EXACT: { type: 'EMIC' as const, name: '500 EMIC', value: 500 },
  };
  await updateGuess36Config({ rewards: mixedRewards }, time(17));
  await enter(0, { type: 'NUMBER', value: 36 }, 18);
  await enter(1, { type: 'EVEN' }, 18);
  const startingBalance = (await prisma.user.findUniqueOrThrow({
    where: { id: users[0].id }, select: { watchPartyCoins: true },
  })).watchPartyCoins;
  const bytes = crypto.randomBytes(9);
  const reserved = await prisma.armoryTicket.create({ data: {
    userId: users[0].id, code: `G36-${bytes.toString('hex').toUpperCase()}`, source: 'GUESS_36',
    claimDate: day(19), expiresAt: getIstMidnight(day(20)), rewardSnapshot: JSON.stringify({ gamingMinutes: 60 }),
  } });
  const random = mock.method(crypto, 'randomBytes', () => bytes);
  try {
    await assert.rejects(() => drawGuess36Round(day(18), time(19), { randomInt: () => 36 }), (error: unknown) =>
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002');
    const round = await prisma.guess36Round.findUniqueOrThrow({ where: { roundDate: day(18) }, include: { entries: true } });
    assert.equal(round.winningNumber, null);
    assert.equal(round.status, 'OPEN');
    assert.equal(await prisma.armoryTicket.count({ where: { source: 'GUESS_36', sourceRefId: { in: round.entries.map((entry) => entry.id) } } }), 0);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: users[0].id } })).watchPartyCoins, startingBalance);
    assert.equal(await prisma.watchPartyCoinLedger.count({ where: { userId: users[0].id, reason: 'GUESS_36_REWARD' } }), 0);
  } finally {
    random.mock.restore();
    await prisma.armoryTicket.delete({ where: { id: reserved.id } });
  }
  assert.equal((await drawGuess36Round(day(18), time(19), { randomInt: () => 36 })).winnerCount, 2);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: users[0].id } })).watchPartyCoins, startingBalance + 500 * EMIC_UNIT_FACTOR);
  assert.equal(await prisma.watchPartyCoinLedger.count({ where: { userId: users[0].id, reason: 'GUESS_36_REWARD' } }), 1);
  const round = await prisma.guess36Round.findUniqueOrThrow({ where: { roundDate: day(18) }, include: { entries: true } });
  assert.equal(await prisma.armoryTicket.count({ where: { source: 'GUESS_36', sourceRefId: { in: round.entries.map((entry) => entry.id) } } }), 1);
  await prisma.setting.update({ where: { key: keys[1] }, data: { value: JSON.stringify(DEFAULT_GUESS_36_REWARDS) } });
});

test('history lists ten published past draws newest first without leaking pending results', async () => {
  for (let index = 19; index <= 29; index += 1) {
    await prisma.guess36Round.create({ data: { roundDate: day(index), status: 'DRAWN', winningNumber: index, publishedAt: time(index + 1) } });
  }
  for (const data of [
    { roundDate: day(30), status: 'OPEN', winningNumber: 8, publishedAt: time(31) },
    { roundDate: day(31), status: 'DRAWN', winningNumber: null, publishedAt: time(32) },
    { roundDate: day(32), status: 'DRAWN', winningNumber: 9, publishedAt: null },
    { roundDate: day(33), status: 'DRAWN', winningNumber: 10, publishedAt: time(37) },
    { roundDate: day(35), status: 'DRAWN', winningNumber: 11, publishedAt: null },
    { roundDate: day(37), status: 'DRAWN', winningNumber: 12, publishedAt: time(35) },
  ]) await prisma.guess36Round.create({ data });
  const state = await getGuess36Current(users[0], time(36));
  assert.deepEqual(state.history, Array.from({ length: 10 }, (_, index) => ({ date: day(29 - index), winningNumber: 29 - index })));
  assert.equal(state.previous.status, 'PENDING');
  assert.equal(state.previous.winningNumber, null);
  assert.equal(state.previous.reward, null);
  const anonymous = await getGuess36Current(null, time(36));
  assert.deepEqual(anonymous.history, state.history);
  assert.deepEqual(anonymous.rewardTickets, []);
});

test('independent public tickets are bounded, code-free, owned, unused, and source isolated', async () => {
  const now = time(36);
  const expiry = getIstMidnight(day(38));
  const createTicket = (index: number, extra = {}) => prisma.armoryTicket.create({ data: {
    userId: users[0].id, code: `G36-${crypto.randomBytes(9).toString('hex').toUpperCase()}`,
    source: 'GUESS_36', claimDate: day(36), claimedAt: new Date(now.getTime() + index), expiresAt: expiry,
    rewardSnapshot: JSON.stringify({ reward: { type: 'PASS', name: `Day Pass ${index}` } }), ...extra,
  } });
  const tickets: Awaited<ReturnType<typeof createTicket>>[] = [];
  for (let index = 0; index < 12; index += 1) tickets.push(await createTicket(index));
  await createTicket(12, { source: 'TOWER' });
  await createTicket(13, { source: 'ARMORY' });
  await createTicket(14, { userId: users[1].id });
  await createTicket(15, { status: 'REDEEMED' });
  await createTicket(16, { expiresAt: now });
  const state = await getGuess36Current(users[0], now);
  assert.equal(state.previous.reward, null);
  assert.deepEqual(state.rewardTickets.map((ticket) => ticket.id), tickets.slice(2).reverse().map((ticket) => ticket.id));
  for (const ticket of state.rewardTickets) {
    assert.deepEqual(Object.keys(ticket).sort(), ['expiresAt', 'id', 'reward']);
    assert.equal(ticket.expiresAt, expiry.toISOString());
    assert.equal(ticket.reward.type, 'PASS');
  }
  assert.ok(Buffer.byteLength(JSON.stringify(state)) < 8000);
  for (const key of ['code', 'sourceRefId', 'rewardSnapshot', 'userId']) assert.equal(JSON.stringify(state).includes(key), false);
  await redeemGuess36Ticket(tickets[11].id, now);
  assert.equal((await getGuess36Current(users[0], now)).rewardTickets.some((ticket) => ticket.id === tickets[11].id), false);
  assert.equal((await getGuess36Current(users[0], new Date(expiry.getTime() - 1))).rewardTickets.length, 10);
  assert.deepEqual((await getGuess36Current(users[0], expiry)).rewardTickets, []);
});

test('environment-free scheduled draw uses only the previous IST day and retries without duplicate tickets', async (context) => {
  await enter(0, { type: 'EVEN' }, 38);
  await enter(4, { type: 'ODD' }, 38);
  const request = (query = '') => new NextRequest(`http://localhost/api/cron/guess-36/draw${query}`);
  const midnight = getIstMidnight(day(39));
  try {
    context.mock.timers.enable({ apis: ['Date'], now: new Date(midnight.getTime() - 1) });
    const beforeBoundary = await runScheduledDraw(request('?roundDate=2099-12-31&winningNumber=1'));
    assert.equal(beforeBoundary.status, 200);
    assert.equal((await beforeBoundary.json()).result.roundDate, day(37));
    assert.equal((await prisma.guess36Round.findUniqueOrThrow({ where: { roundDate: day(38) } })).winningNumber, null);
    context.mock.timers.reset();

    context.mock.timers.enable({ apis: ['Date'], now: midnight });
    const response = await runScheduledDraw(request('?roundDate=2000-01-01&winningNumber=36'));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const draw = (await response.json()).result;
    assert.equal(draw.roundDate, day(38));
    assert.equal(draw.winnerCount, 1);
    assert.equal(draw.generatedAt, midnight.toISOString());
    assert.ok(draw.winningNumber >= 1 && draw.winningNumber <= 36);
    const repeated = await runScheduledDraw(request('?roundDate=2099-12-31'));
    assert.equal(repeated.status, 200);
    assert.deepEqual((await repeated.json()).result, draw);
    const winner = draw.winningNumber % 2 === 0 ? users[0] : users[4];
    const state = await getGuess36Current(winner);
    assert.equal(state.previous.outcome, 'WIN');
    assert.equal(state.rewardTickets.length, 1);
    assert.equal(state.rewardTickets[0].expiresAt, getIstMidnight(day(40)).toISOString());
  } finally {
    context.mock.timers.reset();
  }
});

test('EMIC rewards credit user and admin wallets once while other tiers still create tickets', async () => {
  const emicRewards = {
    EXACT: { type: 'EMIC' as const, name: '500 EMIC', value: 500 },
    GROUP: { type: 'GAMING_TIME' as const, name: '15 Minutes Gaming', value: 15 },
    PARITY: { type: 'GAMING_TIME' as const, name: '10 Minutes Gaming', value: 10 },
  };
  const startingBalances = await prisma.user.findMany({
    where: { id: { in: [users[0].id, users[4].id] } },
    select: { id: true, watchPartyCoins: true },
  });
  const balanceByUser = new Map(startingBalances.map((user) => [user.id, user.watchPartyCoins]));

  try {
    await updateGuess36Config({ rewards: emicRewards }, time(39));
    const exactUser = await enter(0, { type: 'NUMBER', value: 12 }, 40);
    const parityUser = await enter(1, { type: 'EVEN' }, 40);
    const exactAdmin = await enter(4, { type: 'NUMBER', value: 12 }, 40);

    const draws = await Promise.all([
      drawGuess36Round(day(40), time(41), { randomInt: () => 12 }),
      drawGuess36Round(day(40), time(41), { randomInt: () => 12 }),
    ]);
    assert.deepEqual(draws[0], draws[1]);
    assert.equal(draws[0].winnerCount, 3);

    for (const winner of [{ entry: exactUser, userId: users[0].id }, { entry: exactAdmin, userId: users[4].id }]) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: winner.userId }, select: { watchPartyCoins: true } });
      assert.equal(user.watchPartyCoins, balanceByUser.get(winner.userId)! + 500 * EMIC_UNIT_FACTOR);
      assert.equal(await prisma.armoryTicket.count({ where: { source: 'GUESS_36', sourceRefId: winner.entry.id } }), 0);
    }
    const ledgers = await prisma.watchPartyCoinLedger.findMany({
      where: { reason: 'GUESS_36_REWARD', userId: { in: [users[0].id, users[4].id] }, note: { contains: `:${day(40)}:` } },
      orderBy: { userId: 'asc' },
    });
    assert.equal(ledgers.length, 2);
    assert.ok(ledgers.every((ledger) => ledger.amountUnits === 500 * EMIC_UNIT_FACTOR));
    assert.ok(ledgers.some((ledger) => ledger.note?.startsWith(`${exactUser.id}:${day(40)}:EXACT`)));
    assert.ok(ledgers.some((ledger) => ledger.note?.startsWith(`${exactAdmin.id}:${day(40)}:EXACT`)));

    const parityTicket = await prisma.armoryTicket.findUniqueOrThrow({
      where: { source_sourceRefId: { source: 'GUESS_36', sourceRefId: parityUser.id } },
    });
    assert.ok(parityTicket.code.startsWith('G36-'));
    const userState = await getGuess36Current(users[0], time(41));
    assert.deepEqual(userState.previous.reward, emicRewards.EXACT);
    assert.deepEqual(userState.rewardTickets, []);
    assert.equal(JSON.stringify(userState).includes('GUESS_36_REWARD'), false);
    assert.equal((await getGuess36Current(users[1], time(41))).rewardTickets.length, 1);

    const winners = await getGuess36AdminData({ roundDate: day(40), view: 'winners', now: time(41) });
    const emicWinner = winners.items.find((item) => item.id === exactAdmin.id);
    assert.equal(emicWinner?.reward.type, 'EMIC');
    assert.equal(emicWinner?.ticket, null);
    assert.ok(winners.items.find((item) => item.id === parityUser.id)?.ticket);

    const shop = await getEmicRewards(users[4].id);
    const affordableItem = shop.items.find((item) => item.tokenCost <= 500);
    assert.ok(affordableItem);
    const purchased = await purchaseEmicReward(users[4].id, affordableItem!.itemKey);
    assert.ok(purchased.orders.some((order) => order.itemKey === affordableItem!.itemKey));
    assert.equal(purchased.walletCoins, 500 - affordableItem!.tokenCost + (balanceByUser.get(users[4].id) ?? 0) / EMIC_UNIT_FACTOR);

    await drawGuess36Round(day(40), time(41), { randomInt: () => 1 });
    assert.equal(await prisma.watchPartyCoinLedger.count({
      where: { reason: 'GUESS_36_REWARD', userId: { in: [users[0].id, users[4].id] }, note: { contains: `:${day(40)}:` } },
    }), 2);
  } finally {
    await prisma.setting.update({ where: { key: keys[1] }, data: { value: JSON.stringify(DEFAULT_GUESS_36_REWARDS) } });
  }
});
