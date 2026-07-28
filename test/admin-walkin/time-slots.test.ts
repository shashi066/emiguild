import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_WALKIN_TIME_SLOTS,
  validateAdminWalkinTime,
} from '../../lib/admin-walkin-time';
import {
  getTimeSlotsForDate,
  isSlotAvailable,
} from '../../lib/utils';

test('provides the same 9 AM admin schedule every day', () => {
  assert.equal(ADMIN_WALKIN_TIME_SLOTS.length, 28);
  assert.equal(ADMIN_WALKIN_TIME_SLOTS[0], '09:00');
  assert.equal(ADMIN_WALKIN_TIME_SLOTS[1], '09:30');
  assert.equal(ADMIN_WALKIN_TIME_SLOTS.at(-1), '22:30');

  for (let index = 1; index < ADMIN_WALKIN_TIME_SLOTS.length; index += 1) {
    const [previousHour, previousMinute] = ADMIN_WALKIN_TIME_SLOTS[index - 1]
      .split(':')
      .map(Number);
    const [hour, minute] = ADMIN_WALKIN_TIME_SLOTS[index].split(':').map(Number);
    assert.equal(
      hour * 60 + minute - (previousHour * 60 + previousMinute),
      30,
    );
  }
});

test('accepts early half-hour starts and sessions ending exactly at 11 PM', () => {
  assert.equal(validateAdminWalkinTime('09:00', 1).valid, true);
  assert.equal(validateAdminWalkinTime('09:30', 0.5).valid, true);
  assert.equal(validateAdminWalkinTime('22:00', 1).valid, true);
  assert.equal(validateAdminWalkinTime('22:30', 0.5).valid, true);
});

test('rejects starts before 9 AM, invalid intervals, and late finishes', () => {
  for (const [startTime, duration] of [
    ['08:30', 1],
    ['09:15', 1],
    ['22:30', 1],
    ['23:00', 0.5],
    ['09:00', 0],
    ['09:00', 0.75],
  ] as const) {
    assert.equal(
      validateAdminWalkinTime(startTime, duration).valid,
      false,
      `${startTime} for ${duration}h should be rejected`,
    );
  }
});

test('keeps conflicting early walk-in slots unavailable', () => {
  const bookedSlots = [{
    startTime: '09:00',
    endTime: '10:00',
    status: 'CONFIRMED',
  }];

  assert.equal(isSlotAvailable('09:00', 0.5, bookedSlots), false);
  assert.equal(isSlotAvailable('09:30', 0.5, bookedSlots), false);
  assert.equal(isSlotAvailable('10:00', 0.5, bookedSlots), true);
});

test('does not change the public weekday or weekend opening schedule', () => {
  assert.equal(getTimeSlotsForDate('2026-07-27', 30)[0], '16:00');
  assert.equal(getTimeSlotsForDate('2026-08-01', 30)[0], '11:00');
});
