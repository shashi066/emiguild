import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getVenueCapacityBlockedIntervals,
  hasBookingConflict,
  isVenueAtCapacityDuring,
  meetsStationMinimumDuration,
  normalizeVenueCapacity,
} from '../../lib/booking-availability';

test('does not reject a booking just because separate bookings overlap different parts', () => {
  const existing = [
    { startTime: '16:30', endTime: '17:30' },
    { startTime: '17:30', endTime: '18:30' },
  ];

  assert.equal(
    isVenueAtCapacityDuring(
      { startTime: '16:30', endTime: '18:30' },
      existing,
      2,
    ),
    false,
  );
});

test('enforces each station minimum duration server-side', () => {
  assert.equal(meetsStationMinimumDuration(0.5, 1), false);
  assert.equal(meetsStationMinimumDuration(1, 1), true);
  assert.equal(meetsStationMinimumDuration(0.5, 0.5), true);
  assert.equal(meetsStationMinimumDuration(Number.NaN, 1), false);
});

test('blocks only the exact window where both screens are occupied', () => {
  const existing = [
    { startTime: '16:30', endTime: '17:30' },
    { startTime: '17:00', endTime: '18:00' },
  ];

  assert.deepEqual(
    getVenueCapacityBlockedIntervals(existing, 2),
    [{ startTime: '17:00', endTime: '17:30' }],
  );
  assert.equal(
    isVenueAtCapacityDuring(
      { startTime: '17:00', endTime: '17:30' },
      existing,
      2,
    ),
    true,
  );
  assert.equal(
    isVenueAtCapacityDuring(
      { startTime: '17:30', endTime: '18:00' },
      existing,
      2,
    ),
    false,
  );
});

test('merges adjacent full-capacity segments', () => {
  assert.deepEqual(
    getVenueCapacityBlockedIntervals([
      { startTime: '16:00', endTime: '18:00' },
      { startTime: '16:00', endTime: '17:00' },
      { startTime: '17:00', endTime: '18:00' },
    ], 2),
    [{ startTime: '16:00', endTime: '18:00' }],
  );
});

test('station conflicts use half-open intervals', () => {
  const existing = [{ startTime: '16:30', endTime: '17:30' }];

  assert.equal(
    hasBookingConflict(
      { startTime: '17:00', endTime: '18:00' },
      existing,
    ),
    true,
  );
  assert.equal(
    hasBookingConflict(
      { startTime: '17:30', endTime: '18:00' },
      existing,
    ),
    false,
  );
});

test('uses a safe capacity fallback and ignores malformed intervals', () => {
  assert.equal(normalizeVenueCapacity('invalid'), 2);
  assert.equal(normalizeVenueCapacity(0), 2);
  assert.equal(normalizeVenueCapacity('3'), 3);
  assert.deepEqual(
    getVenueCapacityBlockedIntervals([
      { startTime: 'bad', endTime: '17:00' },
      { startTime: '16:00', endTime: '17:00' },
      { startTime: '16:00', endTime: '17:00' },
    ], 'invalid'),
    [{ startTime: '16:00', endTime: '17:00' }],
  );
});
