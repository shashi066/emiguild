import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FORGE_REFRESH_RETRY_MS,
  canRetryForgeRefresh,
  createForgeClockAnchor,
  formatForgeCountdown,
  getForgeRefreshRetryAt,
  getForgeRemainingMs,
  getIstDateKey,
  getNextIstMidnight,
} from '../../lib/armory-clock';

test('Armory reset timestamps follow midnight in Asia/Kolkata', () => {
  assert.equal(getIstDateKey(new Date('2026-07-30T18:29:59.999Z')), '2026-07-30');
  assert.equal(
    getNextIstMidnight(new Date('2026-07-30T18:29:59.999Z')).toISOString(),
    '2026-07-30T18:30:00.000Z',
  );

  assert.equal(getIstDateKey(new Date('2026-07-30T18:30:00.000Z')), '2026-07-31');
  assert.equal(
    getNextIstMidnight(new Date('2026-07-30T18:30:00.000Z')).toISOString(),
    '2026-07-31T18:30:00.000Z',
  );
});

test('Forge countdown is anchored to server duration and monotonic elapsed time', () => {
  const anchor = createForgeClockAnchor(
    '2026-07-30T18:00:00.000Z',
    '2026-07-30T18:30:00.000Z',
    10_000,
  );

  assert.deepEqual(anchor, {
    remainingMsAtAnchor: 30 * 60 * 1000,
    monotonicAnchorMs: 10_000,
  });
  assert.equal(getForgeRemainingMs(anchor, 10_000), 30 * 60 * 1000);
  assert.equal(getForgeRemainingMs(anchor, 10_000 + 12 * 60 * 1000), 18 * 60 * 1000);
  assert.equal(getForgeRemainingMs(anchor, 10_000 + 30 * 60 * 1000), 0);
  assert.equal(getForgeRemainingMs(anchor, 10_000 + 31 * 60 * 1000), 0);
});

test('Changing the device wall clock cannot change an anchored Forge countdown', () => {
  const originalDateNow = Date.now;
  try {
    Date.now = () => Date.parse('2099-01-01T00:00:00.000Z');
    const anchor = createForgeClockAnchor(
      '2026-07-30T18:00:00.000Z',
      '2026-07-30T18:30:00.000Z',
      500,
    );

    Date.now = () => Date.parse('2001-01-01T00:00:00.000Z');
    assert.equal(getForgeRemainingMs(anchor, 60_500), 29 * 60 * 1000);
  } finally {
    Date.now = originalDateNow;
  }
});

test('Forge countdown formatting does not display zero before reset is due', () => {
  assert.equal(formatForgeCountdown(24 * 60 * 60 * 1000), '24:00:00');
  assert.equal(formatForgeCountdown(1_001), '00:00:02');
  assert.equal(formatForgeCountdown(1), '00:00:01');
  assert.equal(formatForgeCountdown(0), '00:00:00');
  assert.equal(formatForgeCountdown(null), '--:--:--');
});

test('Failed authoritative refreshes are throttled for 30 monotonic seconds', () => {
  const failedAt = 42_000;
  const retryAt = getForgeRefreshRetryAt(failedAt);
  assert.equal(retryAt, failedAt + FORGE_REFRESH_RETRY_MS);
  assert.equal(canRetryForgeRefresh(retryAt - 1, retryAt), false);
  assert.equal(canRetryForgeRefresh(retryAt, retryAt), true);
});

test('Invalid server clock data never creates a client unlock anchor', () => {
  assert.equal(createForgeClockAnchor('not-a-date', '2026-07-30T18:30:00.000Z', 0), null);
  assert.equal(createForgeClockAnchor('2026-07-30T18:00:00.000Z', undefined, 0), null);
});
