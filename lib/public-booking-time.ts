export const INDIA_TIME_ZONE = 'Asia/Kolkata';

export const PUBLIC_WEEKDAY_OPEN_MINUTES = 16 * 60;
export const PUBLIC_WEEKEND_OPEN_MINUTES = 11 * 60;
export const PUBLIC_BOOKING_CLOSE_MINUTES = 23 * 60;
export const PUBLIC_BOOKING_SLOT_STEP_MINUTES = 30;

export type PublicBookingHours = {
  dayKind: 'WEEKDAY' | 'WEEKEND';
  openMinutes: number;
  closeMinutes: number;
};

export type PublicBookingTimeValidation =
  | {
      valid: true;
      endMinutes: number;
    }
  | {
      valid: false;
      code:
        | 'INVALID_DATE'
        | 'INVALID_START_TIME'
        | 'INVALID_SLOT_INTERVAL'
        | 'OUTSIDE_PUBLIC_HOURS';
      reason: string;
    };

type CalendarDate = {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
};

function parseCalendarDate(date: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, dayOfWeek: parsed.getUTCDay() };
}

function parseTime(time: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;

  const [hours, minutes] = time.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function getPublicBookingHoursForDate(
  date: string,
): PublicBookingHours | null {
  const parsed = parseCalendarDate(date);
  if (!parsed) return null;

  const isWeekend = parsed.dayOfWeek === 0 || parsed.dayOfWeek === 6;
  return {
    dayKind: isWeekend ? 'WEEKEND' : 'WEEKDAY',
    openMinutes: isWeekend
      ? PUBLIC_WEEKEND_OPEN_MINUTES
      : PUBLIC_WEEKDAY_OPEN_MINUTES,
    closeMinutes: PUBLIC_BOOKING_CLOSE_MINUTES,
  };
}

export function addIndiaCalendarDays(date: string, days: number): string | null {
  const parsed = parseCalendarDate(date);
  if (!parsed || !Number.isInteger(days)) return null;

  const result = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, '0'),
    String(result.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function getPublicTimeSlotsForDate(
  date: string,
  stepMinutes: 30 | 60 = PUBLIC_BOOKING_SLOT_STEP_MINUTES,
): string[] {
  const hours = getPublicBookingHoursForDate(date);
  if (!hours) return [];

  return getPublicTimeSlotsForDay(hours.dayKind, stepMinutes);
}

export function getPublicTimeSlotsForDay(
  dayKind: PublicBookingHours['dayKind'],
  stepMinutes: 30 | 60 = PUBLIC_BOOKING_SLOT_STEP_MINUTES,
): string[] {
  const openMinutes = dayKind === 'WEEKEND'
    ? PUBLIC_WEEKEND_OPEN_MINUTES
    : PUBLIC_WEEKDAY_OPEN_MINUTES;
  const slots: string[] = [];
  for (
    let minutes = openMinutes;
    minutes < PUBLIC_BOOKING_CLOSE_MINUTES;
    minutes += stepMinutes
  ) {
    slots.push(formatMinutes(minutes));
  }
  return slots;
}

export function validatePublicBookingTime(
  date: string,
  startTime: string,
  duration: number,
): PublicBookingTimeValidation {
  const hours = getPublicBookingHoursForDate(date);
  if (!hours) {
    return {
      valid: false,
      code: 'INVALID_DATE',
      reason: 'Select a valid booking date.',
    };
  }

  const startMinutes = parseTime(startTime);
  if (startMinutes == null) {
    return {
      valid: false,
      code: 'INVALID_START_TIME',
      reason: 'Select a valid booking start time.',
    };
  }

  if (
    !Number.isFinite(duration)
    || duration < 0.5
    || duration > 12
    || startMinutes % PUBLIC_BOOKING_SLOT_STEP_MINUTES !== 0
    || !Number.isInteger(duration * 2)
  ) {
    return {
      valid: false,
      code: 'INVALID_SLOT_INTERVAL',
      reason: 'Online bookings must use 30-minute intervals.',
    };
  }

  const endMinutes = startMinutes + Math.round(duration * 60);
  if (
    startMinutes < hours.openMinutes
    || startMinutes >= hours.closeMinutes
    || endMinutes > hours.closeMinutes
  ) {
    const openingTime = hours.dayKind === 'WEEKEND' ? '11:00 AM' : '4:00 PM';
    const dayLabel = hours.dayKind === 'WEEKEND' ? 'weekends' : 'weekdays';
    return {
      valid: false,
      code: 'OUTSIDE_PUBLIC_HOURS',
      reason: `Online bookings on ${dayLabel} must start at or after ${openingTime} and finish by 11:00 PM.`,
    };
  }

  return { valid: true, endMinutes };
}

export type IndiaClock = {
  date: string;
  time: string;
  minutes: number;
};

/**
 * Returns calendar and wall-clock values for an authoritative instant in India.
 * The result never depends on the machine's configured timezone.
 */
export function getIndiaClock(now: Date = new Date()): IndiaClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value ?? ''
  );
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minutes: hour * 60 + minute,
  };
}

/**
 * Keeps the existing 15-minute start-time grace period while comparing against
 * the server instant in India rather than the host machine's local wall clock.
 */
export function isBookingStartPastInIndia(
  date: string,
  startTime: string,
  now: Date = new Date(),
  graceMinutes = 15,
): boolean {
  const startMinutes = parseTime(startTime);
  if (startMinutes == null || !parseCalendarDate(date)) return false;

  const indiaClock = getIndiaClock(now);
  if (date < indiaClock.date) return true;
  if (date > indiaClock.date) return false;

  return (
    startMinutes + graceMinutes <= indiaClock.minutes
  );
}
