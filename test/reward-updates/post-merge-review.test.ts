import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { grantGuessReviewBonus, getMineEligibility } from '../../lib/guess-36-bonuses';
import { getMineState, revealMine } from '../../lib/guess-36-mines';
import { getVaultState } from '../../lib/lifecycle/server';

const url = process.env.DATABASE_URL ?? '';
if (url !== process.env.MINES_TEST_DATABASE_URL || !/mines[-_]test|emiguild_mines_/.test(url)) throw Error('Use an explicit disposable reward-review database.');
after(() => prisma.$disconnect());
const now = new Date('2088-06-10T12:00:00+05:30');
const date = '2088-06-10';
const fixed = (max: number) => max - 1;
const owner = () => prisma.user.create({ data: { name: 'Post-merge fixture', email: `${randomUUID()}@example.test`, password: 'fixture' } });
const enable = () => prisma.setting.upsert({ where: { key: 'guess_36_mines_enabled' }, create: { key: 'guess_36_mines_enabled', value: 'true' }, update: { value: 'true' } });

for (const ending of ['loss', 'timeout'] as const) {
  test(`a competing first reveal recovers its returned run after ${ending}, without spending a bonus`, async () => {
    await enable();
    const user = await owner();
    await grantGuessReviewBonus(user.id, date, now);
    const original = await revealMine(user.id, { date, index: 0, requestId: randomUUID() }, now, fixed);
    const requestId = randomUUID();
    const at = ending === 'timeout' ? new Date(now.getTime() + 90_001) : now;
    const restored = await revealMine(user.id, { date, index: 10, requestId }, at, fixed);
    assert.equal(restored.id, original.id);
    if (ending === 'loss') await revealMine(user.id, { date, index: 5, runId: original.id, version: original.version }, now, fixed);
    // The competing device lost its response and retries after the other run finished.
    const replay = await revealMine(user.id, { date, index: 10, requestId }, at, fixed);
    assert.equal(replay.id, original.id);
    assert.equal(replay.status, ending === 'loss' ? 'LOST' : 'TIMED_OUT');
    assert.equal((await getMineEligibility(user.id, at)).bonuses.length, 1);
    assert.equal(await prisma.guess36Entry.count({ where: { userId: user.id } }), 1);
    assert.equal((await getMineState(user.id, at, undefined, undefined, requestId)).run?.id, original.id);
    await assert.rejects(() => revealMine(user.id, { date, index: 11, requestId }, at, fixed), /different action/);
  });
}

test('an exhausted Expedition remains completed and eligible for its unclaimed Vault review bonus', async () => {
  await enable();
  const user = await owner();
  await revealMine(user.id, { date, index: 5, requestId: randomUUID() }, now, fixed);
  const state = await getVaultState(user.id, now);
  const game = state.games.find(row => row.id === 'guess36')!;
  assert.equal(game.status, 'completed');
  assert.equal(game.facts?.usedToday, true);
  assert.equal(game.facts?.expedition?.enabled, true);
  assert.equal(game.facts?.expedition?.review.claimed, false);
  await grantGuessReviewBonus(user.id, date, now);
  const updated = (await getVaultState(user.id, now)).games.find(row => row.id === 'guess36')!;
  assert.equal(updated.status, 'available');
  assert.equal(updated.action, 'Play Expedition');
  await prisma.setting.update({ where: { key: 'guess_36_mines_enabled' }, data: { value: 'false' } });
  try {
    assert.equal((await getVaultState(user.id, now)).games.find(row => row.id === 'guess36')?.status, 'disabled');
  } finally { await enable(); }
});

test('competing first-pick receipts share the existing run rate limit; saved replays remain recoverable', async () => {
  await enable();
  const user = await owner();
  const run = await revealMine(user.id, { date, index: 0, requestId: randomUUID() }, now, fixed);
  await prisma.guess36Entry.update({ where: { id: run.id }, data: { mineRateAt: now, mineRateCount: 89 } });
  const requestId = randomUUID();
  assert.equal((await revealMine(user.id, { date, index: 10, requestId }, now, fixed)).id, run.id);
  const before = await prisma.rewardReceipt.count({ where: { actorId: user.id } });
  await assert.rejects(() => revealMine(user.id, { date, index: 11, requestId: randomUUID() }, now, fixed), /Too many actions/);
  assert.equal(await prisma.rewardReceipt.count({ where: { actorId: user.id } }), before);
  assert.equal((await revealMine(user.id, { date, index: 10, requestId }, now, fixed)).id, run.id);
});

test('concurrent first requests on opposite sides of IST midnight still share one active run', async () => {
  await enable();
  const user = await owner();
  const results = await Promise.all([
    revealMine(user.id, { date, index: 0, requestId: randomUUID() }, new Date('2088-06-10T23:59:59.999+05:30'), fixed),
    revealMine(user.id, { date: '2088-06-11', index: 1, requestId: randomUUID() }, new Date('2088-06-11T00:00:00.001+05:30'), fixed),
  ]);
  assert.equal(new Set(results.map(run => run.id)).size, 1);
  assert.equal(results[0].tiles.length, 1);
  assert.equal(await prisma.guess36Entry.count({ where: { userId: user.id, mineStatus: 'ACTIVE' } }), 1);
  assert.equal(await prisma.rewardReceipt.count({ where: { actorId: user.id, operation: 'GUESS36_START' } }), 2);
});
