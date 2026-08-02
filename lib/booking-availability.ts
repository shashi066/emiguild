export const DEFAULT_VENUE_CAPACITY = 2;

export type BookingTimeInterval = {
  startTime: string;
  endTime: string;
};

type ParsedInterval = {
  start: number;
  end: number;
};

function parseTime(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours)
    || !Number.isInteger(minutes)
    || hours < 0
    || hours > 24
    || minutes < 0
    || minutes > 59
    || (hours === 24 && minutes !== 0)
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function parseInterval(interval: BookingTimeInterval): ParsedInterval | null {
  const start = parseTime(interval.startTime);
  const end = parseTime(interval.endTime);
  return start != null && end != null && end > start ? { start, end } : null;
}

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function normalizeVenueCapacity(value: unknown) {
  const capacity = Number(value);
  return Number.isInteger(capacity) && capacity > 0
    ? capacity
    : DEFAULT_VENUE_CAPACITY;
}

export function meetsStationMinimumDuration(
  duration: number,
  minimumDuration: number,
) {
  const normalizedMinimum = Number.isFinite(minimumDuration) && minimumDuration > 0
    ? minimumDuration
    : 0.5;
  return Number.isFinite(duration)
    && duration + Number.EPSILON >= normalizedMinimum;
}

export function intervalsOverlap(
  left: BookingTimeInterval,
  right: BookingTimeInterval,
) {
  const parsedLeft = parseInterval(left);
  const parsedRight = parseInterval(right);
  if (!parsedLeft || !parsedRight) return false;

  return parsedLeft.start < parsedRight.end && parsedLeft.end > parsedRight.start;
}

export function hasBookingConflict(
  requested: BookingTimeInterval,
  existing: BookingTimeInterval[],
) {
  return existing.some((booking) => intervalsOverlap(requested, booking));
}

export function getVenueCapacityBlockedIntervals(
  bookings: BookingTimeInterval[],
  capacityValue: unknown,
): BookingTimeInterval[] {
  const capacity = normalizeVenueCapacity(capacityValue);
  const occupancyChanges = new Map<number, number>();

  for (const booking of bookings) {
    const parsed = parseInterval(booking);
    if (!parsed) continue;
    occupancyChanges.set(
      parsed.start,
      (occupancyChanges.get(parsed.start) ?? 0) + 1,
    );
    occupancyChanges.set(
      parsed.end,
      (occupancyChanges.get(parsed.end) ?? 0) - 1,
    );
  }

  const boundaries = [...occupancyChanges.keys()].sort((left, right) => left - right);
  const blocked: BookingTimeInterval[] = [];
  let occupied = 0;

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const segmentStart = boundaries[index];
    const segmentEnd = boundaries[index + 1];
    occupied += occupancyChanges.get(segmentStart) ?? 0;

    if (occupied < capacity || segmentEnd <= segmentStart) continue;

    const startTime = formatTime(segmentStart);
    const endTime = formatTime(segmentEnd);
    const previous = blocked.at(-1);
    if (previous?.endTime === startTime) {
      previous.endTime = endTime;
    } else {
      blocked.push({ startTime, endTime });
    }
  }

  return blocked;
}

export function isVenueAtCapacityDuring(
  requested: BookingTimeInterval,
  existing: BookingTimeInterval[],
  capacityValue: unknown,
) {
  return getVenueCapacityBlockedIntervals(existing, capacityValue)
    .some((blocked) => intervalsOverlap(requested, blocked));
}
