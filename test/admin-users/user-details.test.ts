import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getIstDateTime,
  summarizeUserBookings,
  type BookingStatusAggregate,
} from '../../lib/admin-user-details';

function aggregate(
  status: string,
  count: number,
  totalPrice: number | null,
  duration: number | null,
): BookingStatusAggregate {
  return {
    status,
    _count: { _all: count },
    _sum: { totalPrice, duration },
  };
}

test('returns a zeroed summary for a user with no bookings', () => {
  assert.deepEqual(summarizeUserBookings([]), {
    totalBookings: 0,
    totalBookedHours: 0,
    amountSpent: 0,
    bookingValue: 0,
    pendingBookings: 0,
    confirmedBookings: 0,
    checkedInBookings: 0,
    completedBookings: 0,
    attendedBookings: 0,
    cancelledBookings: 0,
  });
});

test('calculates customer totals from mixed booking statuses', () => {
  const result = summarizeUserBookings([
    aggregate('PENDING', 1, 100, 1),
    aggregate('CONFIRMED', 2, 400, 3),
    aggregate('CHECKED_IN', 1, 300, 1.5),
    aggregate('COMPLETED', 1, 400, 2),
    aggregate('CANCELLED', 3, 900, 6),
  ]);

  assert.deepEqual(result, {
    totalBookings: 8,
    totalBookedHours: 7.5,
    amountSpent: 700,
    bookingValue: 1200,
    pendingBookings: 1,
    confirmedBookings: 2,
    checkedInBookings: 1,
    completedBookings: 1,
    attendedBookings: 2,
    cancelledBookings: 3,
  });
});

test('handles nullable Prisma aggregate values without producing NaN', () => {
  const result = summarizeUserBookings([
    aggregate('CANCELLED', 1, null, null),
  ]);

  assert.equal(result.totalBookings, 1);
  assert.equal(result.totalBookedHours, 0);
  assert.equal(result.amountSpent, 0);
  assert.equal(result.bookingValue, 0);
});

test('builds current date and time in IST across a UTC day boundary', () => {
  assert.deepEqual(
    getIstDateTime(new Date('2026-07-23T18:45:00.000Z')),
    { date: '2026-07-24', time: '00:15' },
  );
});
