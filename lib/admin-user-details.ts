export type BookingStatusAggregate = {
  status: string;
  _count: { _all: number };
  _sum: {
    totalPrice: number | null;
    duration: number | null;
  };
};

export type UserBookingSummary = {
  totalBookings: number;
  totalBookedHours: number;
  amountSpent: number;
  bookingValue: number;
  pendingBookings: number;
  confirmedBookings: number;
  checkedInBookings: number;
  completedBookings: number;
  attendedBookings: number;
  cancelledBookings: number;
};

const ATTENDED_STATUSES = new Set(['CHECKED_IN', 'COMPLETED']);

export function summarizeUserBookings(
  rows: BookingStatusAggregate[],
): UserBookingSummary {
  const counts = new Map(rows.map((row) => [row.status, row._count._all]));
  let totalBookings = 0;
  let totalBookedHours = 0;
  let amountSpent = 0;
  let bookingValue = 0;

  for (const row of rows) {
    const count = row._count._all;
    const value = row._sum.totalPrice ?? 0;
    const hours = row._sum.duration ?? 0;
    totalBookings += count;

    if (row.status !== 'CANCELLED') {
      bookingValue += value;
      totalBookedHours += hours;
    }
    if (ATTENDED_STATUSES.has(row.status)) {
      amountSpent += value;
    }
  }

  const checkedInBookings = counts.get('CHECKED_IN') ?? 0;
  const completedBookings = counts.get('COMPLETED') ?? 0;

  return {
    totalBookings,
    totalBookedHours,
    amountSpent,
    bookingValue,
    pendingBookings: counts.get('PENDING') ?? 0,
    confirmedBookings: counts.get('CONFIRMED') ?? 0,
    checkedInBookings,
    completedBookings,
    attendedBookings: checkedInBookings + completedBookings,
    cancelledBookings: counts.get('CANCELLED') ?? 0,
  };
}

export function getIstDateTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value ?? ''
  );

  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  };
}
