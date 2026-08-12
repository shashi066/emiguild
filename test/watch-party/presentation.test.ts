import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emicRewardCategoryLabel,
  fanPickStatusLabel,
  fanPickWindowStatusLabel,
  formatRewardLabel,
  resolvedRewardLabel,
} from '../../lib/watch-party-presentation';

test('maps stored shop item types to EMIC Reward category labels', () => {
  assert.equal(emicRewardCategoryLabel('HOUR_PASS', 'Gaming'), 'Gaming Passes');
  assert.equal(emicRewardCategoryLabel('DRINK', 'Drinks'), 'Food & Drink Rewards');
  assert.equal(emicRewardCategoryLabel('GUILD_MEMBERSHIP', 'Guild'), 'Guild Membership Rewards');
  assert.equal(emicRewardCategoryLabel('CUSTOM', 'Special'), 'Special');
});

test('formats configured multipliers as reward labels', () => {
  assert.equal(formatRewardLabel('2x'), '2× Reward');
  assert.equal(formatRewardLabel('3.25x'), '3.25× Reward');
  assert.equal(formatRewardLabel('10×'), '10× Reward');
  assert.equal(formatRewardLabel('not-a-number'), 'Reward');
});

test('maps stored fan pick statuses to public labels', () => {
  assert.equal(fanPickStatusLabel('ACTIVE'), 'Confirmed');
  assert.equal(fanPickStatusLabel('WON'), 'Correct Pick');
  assert.equal(fanPickStatusLabel('LOST'), 'Pick Did Not Match');
  assert.equal(fanPickStatusLabel('VOID'), 'EMIC Restored');
  assert.equal(fanPickStatusLabel('UNKNOWN'), 'Status Unavailable');
});

test('maps fan pick window statuses to public labels', () => {
  assert.equal(fanPickWindowStatusLabel('OPEN'), 'Fan Picks Open');
  assert.equal(fanPickWindowStatusLabel('CLOSED'), 'Awaiting Official Result');
  assert.equal(fanPickWindowStatusLabel('SETTLED'), 'Completed');
  assert.equal(fanPickWindowStatusLabel('VOID'), 'EMIC Restored');
  assert.equal(fanPickWindowStatusLabel('UNKNOWN'), 'Fan Picks Unavailable');
});

test('uses status-aware reward result labels', () => {
  assert.equal(resolvedRewardLabel('ACTIVE'), 'Potential Reward');
  assert.equal(resolvedRewardLabel('WON'), 'Reward Credited');
  assert.equal(resolvedRewardLabel('LOST'), 'No Reward Credited');
  assert.equal(resolvedRewardLabel('VOID'), 'EMIC Restored');
});
