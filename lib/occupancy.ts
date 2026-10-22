import { normalizeVenueCapacity } from "./booking-availability";

export type OccupancyBooking = {
  date: string;
  stationId: string;
  status: string;
  startTime: string;
  endTime: string;
};
export type OccupancyMetric = {
  occupiedMinutes: number;
  availableMinutes: number;
  percentage: number;
  bookingCount: number;
  dayCount: number;
};
export type OccupancyBucket = OccupancyMetric & {
  key: string;
  from: string;
  to: string;
};
const DAY = 86400000;
export const OCCUPANCY_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * DAY)
    .toISOString()
    .slice(0, 10);
}
export function weekStart(date: string) {
  return shiftDate(
    date,
    -((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7),
  );
}
export function validateOccupancyRange(
  from: string,
  to: string,
  today: string,
): string | null {
  const valid = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date + "T00:00:00Z")) &&
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) === date;
  if (!valid(from) || !valid(to)) return "Choose valid start and end dates.";
  if (from > to) return "Start date must not follow end date.";
  if (to > today) return "Future dates are not available.";
  if ((Date.parse(to) - Date.parse(from)) / DAY >= 366)
    return "Choose a range of at most 366 days.";
  return null;
}
function metric(
  occupiedMinutes = 0,
  availableMinutes = 0,
  bookingCount = 0,
  dayCount = 0,
): OccupancyMetric {
  return {
    occupiedMinutes,
    availableMinutes,
    bookingCount,
    dayCount,
    percentage: availableMinutes
      ? Math.round((occupiedMinutes / availableMinutes) * 1000) / 10
      : 0,
  };
}
export function sumOccupancy(rows: OccupancyMetric[]): OccupancyMetric {
  return metric(
    rows.reduce((n, r) => n + r.occupiedMinutes, 0),
    rows.reduce((n, r) => n + r.availableMinutes, 0),
    rows.reduce((n, r) => n + r.bookingCount, 0),
    rows.reduce((n, r) => n + r.dayCount, 0),
  );
}
function minutes(time: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(time)) return NaN;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function calculateOccupancy(
  bookings: OccupancyBooking[],
  capacityValue: unknown,
  from: string,
  to: string,
) {
  const capacity = normalizeVenueCapacity(capacityValue);
  const byDate = new Map<string, OccupancyBooking[]>();
  for (const b of bookings)
    if (b.status === "CHECKED_IN" && b.date >= from && b.date <= to)
      byDate.set(b.date, [...(byDate.get(b.date) ?? []), b]);
  const daily: OccupancyBucket[] = [];
  const heatmap = OCCUPANCY_DAYS.map((label, day) => ({
    day,
    label,
    cells: Array.from({ length: 10 }, (_, i) => ({
      hour: i + 13,
      ...metric(),
    })),
  }));
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    const day = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
    const open = day >= 5 ? 13 * 60 : 16 * 60,
      close = 23 * 60;
    const intervals = (byDate.get(date) ?? []).flatMap((b) => {
      const start = Math.max(open, minutes(b.startTime)),
        end = Math.min(close, minutes(b.endTime));
      return Number.isFinite(start) && Number.isFinite(end) && end > start
        ? [{ start, end, stationId: b.stationId }]
        : [];
    });
    // Partition by interval and hour boundaries; count each occupied station once.
    const boundaries = [
      ...new Set([
        open,
        close,
        ...Array.from({ length: (close - open) / 60 }, (_, i) => open + i * 60),
        ...intervals.flatMap((b) => [b.start, b.end]),
      ]),
    ].sort((a, b) => a - b);
    const hours = new Map<number, number>();
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i],
        end = boundaries[i + 1];
      const occupied = Math.min(
        capacity,
        new Set(
          intervals
            .filter((b) => b.start <= start && b.end > start)
            .map((b) => b.stationId),
        ).size,
      );
      const hour = Math.floor(start / 60);
      hours.set(hour, (hours.get(hour) ?? 0) + occupied * (end - start));
    }
    daily.push({
      key: date,
      from: date,
      to: date,
      ...metric(
        [...hours.values()].reduce((a, b) => a + b, 0),
        (close - open) * capacity,
        intervals.length,
        1,
      ),
    });
    for (const cell of heatmap[day].cells)
      if (cell.hour * 60 >= open) {
        Object.assign(
          cell,
          sumOccupancy([
            cell,
            metric(
              hours.get(cell.hour) ?? 0,
              60 * capacity,
              intervals.filter(
                (b) => b.start < (cell.hour + 1) * 60 && b.end > cell.hour * 60,
              ).length,
              1,
            ),
          ]),
        );
      }
  }
  function group(keyOf: (date: string) => string) {
    const groups = new Map<string, OccupancyBucket[]>();
    for (const row of daily) {
      const key = keyOf(row.key);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups].map(([key, rows]) => ({
      key,
      from: rows[0].from,
      to: rows[rows.length - 1].to,
      ...sumOccupancy(rows),
    }));
  }
  const dayOfWeek = OCCUPANCY_DAYS.map((label, day) => ({
    label,
    day,
    ...sumOccupancy(
      daily.filter(
        (row) => (new Date(row.key + "T00:00:00Z").getUTCDay() + 6) % 7 === day,
      ),
    ),
  }));
  return {
    from,
    to,
    capacity,
    summary: sumOccupancy(daily),
    daily,
    weekly: group(weekStart),
    monthly: group((date) => date.slice(0, 7)),
    dayOfWeek,
    weekdays: sumOccupancy(dayOfWeek.slice(0, 5)),
    weekends: sumOccupancy(dayOfWeek.slice(5)),
    heatmap,
  };
}
export type OccupancyReport = ReturnType<typeof calculateOccupancy>;
export function occupancyHours(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(
    value / 60,
  );
}
