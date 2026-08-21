import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUBLIC_BOOKING_CLOSE_MINUTES,
  PUBLIC_WEEKDAY_OPEN_MINUTES,
  PUBLIC_WEEKEND_OPEN_MINUTES,
  addIndiaCalendarDays,
  getActiveSpecialOpening,
  getIndiaClock,
  getPublicBookingHoursForDate,
  getPublicTimeSlotsForDate,
  isBookingStartPastInIndia,
  validatePublicBookingTime,
} from '../../lib/public-booking-time';
import { validateAdminWalkinTime } from '../../lib/admin-walkin-time';
import { getTimeSlotsForDate } from '../../lib/utils';

function assertRejectedWith(
  validation: ReturnType<typeof validatePublicBookingTime>,
  code: Exclude<typeof validation, { valid: true }>['code'],
) {
  assert.equal(validation.valid, false);
  if (validation.valid) assert.fail('Expected booking time to be rejected');
  assert.equal(validation.code, code);
  assert.ok(validation.reason.length > 0);
}

test('derives weekday and weekend hours without using the host timezone', () => {
  const originalTimeZone = process.env.TZ;

  try {
    process.env.TZ = 'America/Los_Angeles';
    const weekdayInLosAngeles = getPublicBookingHoursForDate('2026-07-27');
    const weekendInLosAngeles = getPublicBookingHoursForDate('2026-08-01');

    process.env.TZ = 'Pacific/Kiritimati';
    assert.deepEqual(
      getPublicBookingHoursForDate('2026-07-27'),
      weekdayInLosAngeles,
    );
    assert.deepEqual(
      getPublicBookingHoursForDate('2026-08-01'),
      weekendInLosAngeles,
    );
  } finally {
    if (originalTimeZone == null) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
  }

  assert.deepEqual(getPublicBookingHoursForDate('2026-07-27'), {
    dayKind: 'WEEKDAY',
    openMinutes: PUBLIC_WEEKDAY_OPEN_MINUTES,
    closeMinutes: PUBLIC_BOOKING_CLOSE_MINUTES,
  });
  assert.deepEqual(getPublicBookingHoursForDate('2026-08-01'), {
    dayKind: 'WEEKEND',
    openMinutes: PUBLIC_WEEKEND_OPEN_MINUTES,
    closeMinutes: PUBLIC_BOOKING_CLOSE_MINUTES,
  });
  assert.deepEqual(getPublicBookingHoursForDate('2026-08-02'), {
    dayKind: 'WEEKEND',
    openMinutes: PUBLIC_WEEKEND_OPEN_MINUTES,
    closeMinutes: PUBLIC_BOOKING_CLOSE_MINUTES,
  });
});

test('adds India calendar days without using the device timezone', () => {
  assert.equal(addIndiaCalendarDays('2026-07-31', 1), '2026-08-01');
  assert.equal(addIndiaCalendarDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addIndiaCalendarDays('not-a-date', 1), null);
});

test('uses the centralized public schedule for booking slot lists', () => {
  const weekdaySlots = getPublicTimeSlotsForDate('2026-07-27');
  const weekendSlots = getTimeSlotsForDate('2026-08-01');

  assert.equal(weekdaySlots.length, 14);
  assert.equal(weekdaySlots[0], '16:00');
  assert.equal(weekdaySlots.at(-1), '22:30');
  assert.equal(weekendSlots.length, 24);
  assert.equal(weekendSlots[0], '11:00');
  assert.equal(weekendSlots.at(-1), '22:30');
});

test('applies a valid same-day early opening override to slots and validation', () => {
  const specialOpening = getActiveSpecialOpening(
    {
      special_opening_enabled: 'true',
      special_opening_date: '2026-07-27',
      special_opening_time: '11:00',
    },
    '2026-07-27',
  );

  assert.ok(specialOpening);
  assert.deepEqual(getPublicBookingHoursForDate('2026-07-27', specialOpening), {
    dayKind: 'WEEKDAY',
    openMinutes: PUBLIC_WEEKEND_OPEN_MINUTES,
    closeMinutes: PUBLIC_BOOKING_CLOSE_MINUTES,
  });

  const slots = getPublicTimeSlotsForDate('2026-07-27', 30, specialOpening);
  assert.equal(slots.length, 24);
  assert.equal(slots[0], '11:00');
  assert.equal(slots.at(-1), '22:30');
  assert.equal(
    validatePublicBookingTime('2026-07-27', '11:00', 1, specialOpening).valid,
    true,
  );

  assertRejectedWith(
    validatePublicBookingTime('2026-07-28', '11:00', 1, specialOpening),
    'OUTSIDE_PUBLIC_HOURS',
  );
});

test('ignores disabled, expired, invalid, and non-early opening overrides', () => {
  assert.equal(
    getActiveSpecialOpening(
      {
        special_opening_enabled: 'false',
        special_opening_date: '2026-07-27',
        special_opening_time: '11:00',
      },
      '2026-07-27',
    ),
    null,
  );
  assert.equal(
    getActiveSpecialOpening(
      {
        special_opening_enabled: 'true',
        special_opening_date: '2026-07-26',
        special_opening_time: '11:00',
      },
      '2026-07-27',
    ),
    null,
  );
  assert.equal(
    getActiveSpecialOpening(
      {
        special_opening_enabled: 'true',
        special_opening_date: '2026-07-27',
        special_opening_time: '11:15',
      },
      '2026-07-27',
    ),
    null,
  );
  assert.equal(
    getActiveSpecialOpening(
      {
        special_opening_enabled: 'true',
        special_opening_date: '2026-07-27',
        special_opening_time: '16:00',
      },
      '2026-07-27',
    ),
    null,
  );
});

test('accepts public-hour boundaries and sessions ending exactly at 11 PM', () => {
  assert.equal(validatePublicBookingTime('2026-07-27', '16:00', 0.5).valid, true);
  assert.equal(validatePublicBookingTime('2026-07-27', '22:30', 0.5).valid, true);
  assert.equal(validatePublicBookingTime('2026-08-01', '11:00', 1).valid, true);
  assert.equal(validatePublicBookingTime('2026-08-02', '22:00', 1).valid, true);
});

test('keeps the online schedule separate from the admin walk-in schedule', () => {
  assertRejectedWith(
    validatePublicBookingTime('2026-07-27', '09:00', 1),
    'OUTSIDE_PUBLIC_HOURS',
  );
  assert.equal(validateAdminWalkinTime('09:00', 1).valid, true);
  assert.equal(validateAdminWalkinTime('22:30', 0.5).valid, true);
});

test('rejects starts before opening, at closing, and sessions finishing after closing', () => {
  for (const [date, startTime, duration] of [
    ['2026-07-27', '15:30', 1],
    ['2026-07-27', '22:30', 1],
    ['2026-07-27', '23:00', 0.5],
    ['2026-08-01', '10:30', 1],
    ['2026-08-01', '22:30', 1],
    ['2026-08-01', '23:00', 0.5],
  ] as const) {
    assertRejectedWith(
      validatePublicBookingTime(date, startTime, duration),
      'OUTSIDE_PUBLIC_HOURS',
    );
  }
});

test('rejects invalid dates, times, and non-30-minute intervals with stable codes', () => {
  assertRejectedWith(
    validatePublicBookingTime('2026-02-29', '16:00', 1),
    'INVALID_DATE',
  );
  assertRejectedWith(
    validatePublicBookingTime('2026-07-27', '24:00', 1),
    'INVALID_START_TIME',
  );
  assertRejectedWith(
    validatePublicBookingTime('2026-07-27', '16:15', 1),
    'INVALID_SLOT_INTERVAL',
  );
  assertRejectedWith(
    validatePublicBookingTime('2026-07-27', '16:00', 0.75),
    'INVALID_SLOT_INTERVAL',
  );
});

test('gets the authoritative India wall clock from a server instant', () => {
  assert.deepEqual(
    getIndiaClock(new Date('2026-07-27T18:40:00.000Z')),
    {
      date: '2026-07-28',
      time: '00:10',
      minutes: 10,
    },
  );
});

test('preserves the 15-minute past-slot grace period in India time', () => {
  assert.equal(
    isBookingStartPastInIndia(
      '2026-07-28',
      '17:00',
      new Date('2026-07-28T11:44:59.000Z'),
    ),
    false,
  );
  assert.equal(
    isBookingStartPastInIndia(
      '2026-07-28',
      '17:00',
      new Date('2026-07-28T11:45:00.000Z'),
    ),
    true,
  );

  // At this instant UTC is still July 27, but India is already July 28.
  assert.equal(
    isBookingStartPastInIndia(
      '2026-07-28',
      '00:00',
      new Date('2026-07-27T18:45:00.000Z'),
    ),
    true,
  );
  assert.equal(
    isBookingStartPastInIndia(
      '2026-07-27',
      '00:00',
      new Date('2026-07-27T18:45:00.000Z'),
    ),
    true,
  );
  assert.equal(
    isBookingStartPastInIndia(
      '2026-07-27',
      '22:30',
      new Date('2026-07-28T11:45:00.000Z'),
    ),
    true,
  );
  assert.equal(
    isBookingStartPastInIndia(
      '2026-07-29',
      '16:00',
      new Date('2026-07-28T11:45:00.000Z'),
    ),
    false,
  );
});
