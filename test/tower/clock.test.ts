import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TOWER_RUN_DURATION_SECONDS,
  TOWER_RUN_DURATION_MS,
  TOWER_RUN_DURATION_OPTIONS_SECONDS,
  TOWER_WARNING_THRESHOLD_MS,
  createTowerClockAnchor,
  formatTowerCountdown,
  getTowerRemainingMs,
  getTowerRunExpiry,
} from '../../lib/tower-clock';

test('Tower run deadlines default to 120 seconds, accept presets, and stop at the token deadline', () => {
  const startedAt = new Date('2030-08-20T12:00:00.000Z');
  assert.equal(
    getTowerRunExpiry(startedAt, new Date('2030-08-20T13:00:00.000Z')).toISOString(),
    '2030-08-20T12:02:00.000Z',
  );
  assert.equal(
    getTowerRunExpiry(startedAt, new Date('2030-08-20T12:00:30.000Z'), 150).toISOString(),
    '2030-08-20T12:00:30.000Z',
  );
  assert.equal(
    getTowerRunExpiry(startedAt, new Date('2030-08-20T13:00:00.000Z'), 150).toISOString(),
    '2030-08-20T12:02:30.000Z',
  );
  assert.equal(DEFAULT_TOWER_RUN_DURATION_SECONDS, 120);
  assert.equal(TOWER_RUN_DURATION_MS, 120_000);
  assert.deepEqual(TOWER_RUN_DURATION_OPTIONS_SECONDS, [60, 90, 120, 150, 180, 210, 240, 270, 300]);
  assert.equal(TOWER_WARNING_THRESHOLD_MS, 60_000);
});

test('Tower countdown is anchored to server time and monotonic elapsed time', () => {
  const anchor = createTowerClockAnchor(
    '2030-08-20T12:00:00.000Z',
    '2030-08-20T12:02:00.000Z',
    5_000,
  );
  assert.ok(anchor);
  assert.equal(getTowerRemainingMs(anchor, 5_000), 120_000);
  assert.equal(getTowerRemainingMs(anchor, 65_000), 60_000);
  assert.equal(getTowerRemainingMs(anchor, 124_999), 1);
  assert.equal(getTowerRemainingMs(anchor, 125_000), 0);
  assert.equal(formatTowerCountdown(120_000), '2:00');
  assert.equal(formatTowerCountdown(60_000), '1:00');
  assert.equal(formatTowerCountdown(1), '0:01');
  assert.equal(formatTowerCountdown(0), '0:00');
});

test('Tower countdown rejects malformed anchors', () => {
  assert.equal(createTowerClockAnchor(null, '2030-08-20T12:02:00.000Z', 0), null);
  assert.equal(createTowerClockAnchor('bad', '2030-08-20T12:02:00.000Z', 0), null);
  assert.equal(createTowerClockAnchor('2030-08-20T12:00:00.000Z', 'bad', 0), null);
  assert.equal(formatTowerCountdown(null), '--:--');
});
