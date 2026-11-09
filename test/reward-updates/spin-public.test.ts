import assert from 'node:assert/strict';
import test from 'node:test';
import { publicSpinFailure, serializeSpinResult, serializeSpinStatus } from '../../lib/spin-public';
import { RewardError, rewardFailure } from '../../lib/november';

const reward = { id: 'reward', name: '15 minutes gaming', description: 'PS5 time', rarity: 'COMMON', iconUrl: null, weight: 90, selected: true };
const streak = { current: 3, target: 10, guaranteedToday: false, spinsRemaining: 7 };
const legendary = { enabled: true, current: 13, target: 30, spinsRemaining: 17 };
const spinRecord = { id: 'spin', userId: 'owner', spinDate: '2026-11-09', attempts: 1,
  createdAt: new Date('2026-11-09T12:00:00Z'), lootItem: reward,
  guaranteeReason: 'ADMIN_SELECTED', rewardSnapshot: JSON.stringify(reward) };
const saved = { success: true, reward, spinRecord, streak, legendary, remainingRetries: 0,
  streakReward: false, nextReset: '2026-11-09T18:30:00Z', guaranteeReason: 'ADMIN_SELECTED',
  featuredReward: reward, selection: { enabled: true, itemId: reward.id, version: 7 } };
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const publicOnly = (value: unknown) => assert.doesNotMatch(JSON.stringify(value), /featuredReward|guaranteeReason|ADMIN_SELECTED|rewardSnapshot|selection|userId|"selected"/);

test('status allows only public reward and progress fields, including nested records', () => {
  const state = { settings: { enabled: true }, canSpin: false, spinDate: spinRecord.spinDate,
    spin: spinRecord, streak, legendary, items: [reward], nextReset: new Date(saved.nextReset),
    featuredReward: reward, selection: saved.selection };
  const output = serializeSpinStatus(state as unknown as Parameters<typeof serializeSpinStatus>[0]);
  publicOnly(output);
  assert.equal(output.spin?.lootItem?.name, reward.name);
  assert.equal(typeof output.lootItems[0].weight, 'string');
  assert.deepEqual(output.streak, streak);
  assert.deepEqual(output.legendary, legendary);
  assert.equal(output.canSpin, false);
  assert.equal(output.remainingRetries, 0);
});

test('fresh results and old receipt responses share the public contract without altering saved data', () => {
  const before = JSON.stringify(saved);
  const fresh = serializeSpinResult(saved);
  const recovered = serializeSpinResult(json(saved));
  publicOnly(fresh); publicOnly(recovered);
  assert.deepEqual(json(fresh), json(recovered));
  assert.equal(fresh.reward?.id, reward.id);
  assert.equal(fresh.spinRecord.id, spinRecord.id);
  assert.equal(JSON.stringify(saved), before);
  assert.equal(saved.guaranteeReason, 'ADMIN_SELECTED');
  assert.equal(saved.spinRecord.guaranteeReason, 'ADMIN_SELECTED');
  assert.equal(serializeSpinResult({ ...saved, recovered: true }).recovered, true);
});

test('guarantee results retain awarded rarity, Epic reveal flag and reset progress', () => {
  for (const rarity of ['EPIC', 'LEGENDARY']) {
    const output = serializeSpinResult({ ...saved, reward: { ...reward, rarity },
      guaranteeReason: rarity, streakReward: rarity === 'EPIC',
      legendary: { ...legendary, current: rarity === 'LEGENDARY' ? 0 : 14 } });
    publicOnly(output);
    assert.equal(output.reward?.rarity, rarity);
    assert.equal(output.streakReward, rarity === 'EPIC');
    assert.equal(output.legendary.current, rarity === 'LEGENDARY' ? 0 : 14);
  }
});

test('configuration failures are generic publicly while admin diagnostics remain available', async t => {
  const logs: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => logs.push(args));
  for (const code of ['INVALID_SELECTION_CONFIG', 'SELECTED_REWARD_UNAVAILABLE']) {
    const error = new RewardError(code, 'Internal selected reward configuration details', 503);
    const response = publicSpinFailure(error);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Daily spin is temporarily unavailable. Your spin is unused.', code: 'SPIN_UNAVAILABLE' });
    assert.equal((await rewardFailure(error).json()).code, code, 'admin error contract remains detailed');
  }
  assert.equal(logs.length, 2);
});

test('ownership, pause and recovery conflicts retain their existing public behavior', async () => {
  for (const [code, status] of [['FORBIDDEN', 403], ['SPIN_PAUSED', 403], ['REQUEST_CONFLICT', 409], ['NOT_FOUND', 404]] as const) {
    const response = publicSpinFailure(new RewardError(code, 'Existing message', status));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { code, error: 'Existing message' });
  }
});

test('an incomplete saved result cannot become a fabricated public award', () => {
  assert.throws(() => serializeSpinResult({ reward, guaranteeReason: 'ADMIN_SELECTED' }), /Invalid saved Spin result/);
});
