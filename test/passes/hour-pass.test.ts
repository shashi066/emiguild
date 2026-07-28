import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateHourPassUsageUpdates,
  getHourPassRemainingForBooking,
  getHourPassStatusAfterUsage,
  isHourPassAllowedForStation,
  validateHourPassApplication,
  type HourPassRecord,
} from '../../lib/hour-pass';

const now = new Date('2026-07-28T06:30:00.000Z');

function pass(overrides: Partial<HourPassRecord> = {}): HourPassRecord {
  return {
    id: 'pass-1',
    userId: 'user-1',
    passType: 'BRONZE',
    totalHours: 10,
    usedHours: 4,
    status: 'ACTIVE',
    expiresAt: '2026-08-20T06:30:00.000Z',
    ...overrides,
  };
}

function validate(overrides: Partial<Parameters<typeof validateHourPassApplication>[0]> = {}) {
  return validateHourPassApplication({
    pass: pass(),
    userId: 'user-1',
    bookingDate: '2026-07-28',
    duration: 2,
    hasControllers: true,
    now,
    ...overrides,
  });
}

test('maps PS5 and simulator pass families without accepting memberships', () => {
  for (const passType of ['BRONZE', 'SILVER', 'GOLD']) {
    assert.equal(isHourPassAllowedForStation(passType, true), true);
    assert.equal(isHourPassAllowedForStation(passType, false), false);
  }
  for (const passType of ['BLACK', 'APEX']) {
    assert.equal(isHourPassAllowedForStation(passType, false), true);
    assert.equal(isHourPassAllowedForStation(passType, true), false);
  }
  assert.equal(isHourPassAllowedForStation('GUILD_MASTER', true), false);
});

test('accepts an owned active pass with enough weekday hours', () => {
  const result = validate();
  assert.equal(result.valid, true);
  assert.equal(result.remainingHours, 6);
});

test('blocks weekends, station mismatches, and crafted pass ownership', () => {
  const weekend = validate({ bookingDate: '2026-08-01' });
  assert.equal(weekend.valid, false);
  assert.equal(weekend.valid ? '' : weekend.code, 'PASS_WEEKDAY_ONLY');

  const stationMismatch = validate({ hasControllers: false });
  assert.equal(stationMismatch.valid, false);
  assert.equal(stationMismatch.valid ? '' : stationMismatch.code, 'PASS_STATION_MISMATCH');

  const wrongOwner = validate({ pass: pass({ userId: 'someone-else' }) });
  assert.equal(wrongOwner.valid, false);
  assert.equal(wrongOwner.valid ? '' : wrongOwner.code, 'PASS_NOT_FOUND');
});

test('restores the current booking reservation before validating a resize', () => {
  const current = pass({
    totalHours: 10,
    usedHours: 10,
    status: 'EXHAUSTED',
  });

  assert.equal(getHourPassRemainingForBooking({
    pass: current,
    currentPassId: current.id,
    currentPassHours: 2,
  }), 2);

  const result = validate({
    pass: current,
    duration: 1.5,
    currentPassId: current.id,
    currentPassHours: 2,
  });
  assert.equal(result.valid, true);
});

test('does not borrow the old booking reservation when switching passes', () => {
  const selected = pass({
    id: 'pass-2',
    totalHours: 10,
    usedHours: 9.5,
  });
  const result = validate({
    pass: selected,
    duration: 1,
    currentPassId: 'pass-1',
    currentPassHours: 2,
  });

  assert.equal(result.valid, false);
  assert.equal(result.valid ? '' : result.code, 'PASS_HOURS_INSUFFICIENT');
  assert.equal(result.remainingHours, 0.5);
});

test('blocks expired, revoked, and unrelated exhausted passes', () => {
  for (const candidate of [
    pass({ expiresAt: '2026-07-27T06:30:00.000Z' }),
    pass({ status: 'REVOKED' }),
    pass({ id: 'pass-2', status: 'EXHAUSTED', usedHours: 10 }),
  ]) {
    assert.equal(validate({ pass: candidate }).valid, false);
  }
});

test('restored pass status stays revoked or expired and otherwise reactivates', () => {
  assert.equal(getHourPassStatusAfterUsage({
    currentStatus: 'EXHAUSTED',
    expiresAt: '2026-08-20T06:30:00.000Z',
    totalHours: 10,
    usedHours: 8,
    selected: false,
    now,
  }), 'ACTIVE');
  assert.equal(getHourPassStatusAfterUsage({
    currentStatus: 'REVOKED',
    expiresAt: '2026-08-20T06:30:00.000Z',
    totalHours: 10,
    usedHours: 8,
    selected: false,
    now,
  }), 'REVOKED');
  assert.equal(getHourPassStatusAfterUsage({
    currentStatus: 'EXPIRED',
    expiresAt: '2026-08-20T06:30:00.000Z',
    totalHours: 10,
    usedHours: 8,
    selected: false,
    now,
  }), 'EXPIRED');
  assert.equal(getHourPassStatusAfterUsage({
    currentStatus: 'ACTIVE',
    expiresAt: '2026-08-20T06:30:00.000Z',
    totalHours: 10,
    usedHours: 10,
    selected: true,
    now,
  }), 'EXHAUSTED');
});

test('calculates apply, resize, switch, and removal balances exactly once', () => {
  const original = pass({ id: 'old', usedHours: 10, status: 'EXHAUSTED' });
  const replacement = pass({ id: 'new', passType: 'SILVER', usedHours: 3 });

  assert.deepEqual(calculateHourPassUsageUpdates({
    currentPass: null,
    currentPassHours: 0,
    selectedPass: replacement,
    selectedHours: 2,
    now,
  }), [{ id: 'new', usedHours: 5, status: 'ACTIVE' }]);

  assert.deepEqual(calculateHourPassUsageUpdates({
    currentPass: original,
    currentPassHours: 2,
    selectedPass: original,
    selectedHours: 1.5,
    now,
  }), [{ id: 'old', usedHours: 9.5, status: 'ACTIVE' }]);

  assert.deepEqual(calculateHourPassUsageUpdates({
    currentPass: original,
    currentPassHours: 2,
    selectedPass: replacement,
    selectedHours: 1,
    now,
  }), [
    { id: 'old', usedHours: 8, status: 'ACTIVE' },
    { id: 'new', usedHours: 4, status: 'ACTIVE' },
  ]);

  assert.deepEqual(calculateHourPassUsageUpdates({
    currentPass: original,
    currentPassHours: 2,
    selectedPass: null,
    selectedHours: 0,
    now,
  }), [{ id: 'old', usedHours: 8, status: 'ACTIVE' }]);
});
