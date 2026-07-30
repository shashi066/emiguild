import {
  PUBLIC_BOOKING_CLOSE_MINUTES,
  getPublicTimeSlotsForDay,
  getPublicTimeSlotsForDate,
} from './public-booking-time';

export const CLOSING_HOUR = PUBLIC_BOOKING_CLOSE_MINUTES / 60;

// Kept for existing callers that expect the default weekday schedule.
export const TIME_SLOTS = getPublicTimeSlotsForDay('WEEKDAY');

export function getTimeSlotsForDate(dateStr: string, stepMins: 30 | 60 = 30): string[] {
  return getPublicTimeSlotsForDate(dateStr, stepMins);
}

/** Returns duration options (in hours) for a given minDuration.
 *  If minDuration = 0.5: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6]
 *  If minDuration = 1:   [1, 2, 3, 4, 5, 6]
 */
export function getDurationOptions(minDuration: number): { value: number; label: string }[] {
  const step = minDuration <= 0.5 ? 0.5 : 1;
  const max = 6;
  const options: { value: number; label: string }[] = [];
  for (let v = minDuration; v <= max; v = Math.round((v + step) * 10) / 10) {
    options.push({
      value: v,
      label: v === 0.5 ? '30 min' : v % 1 === 0 ? `${v} Hour${v > 1 ? 's' : ''}` : `${v} Hours`,
    });
  }
  return options;
}

export const DURATION_OPTIONS = [
  { value: 1, label: '1 Hour' },
  { value: 2, label: '2 Hours' },
  { value: 3, label: '3 Hours' },
  { value: 4, label: '4 Hours' },
];

export const BOOKING_STATUSES = {
  PENDING: { label: 'Pending', color: '#f59e0b' },
  CONFIRMED: { label: 'Confirmed', color: '#10b981' },
  CANCELLED: { label: 'Cancelled', color: '#ef4444' },
  COMPLETED: { label: 'Completed', color: '#6366f1' },
};

export function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMins = h * 60 + m + Math.round(hours * 60);
  const newH = Math.floor(totalMins / 60);
  const newM = totalMins % 60;
  if (newH > 24) return '00:00';
  if (newH === 24 && newM === 0) return '24:00';
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function toMins(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (h === 24) return '12:00 AM'; // midnight
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getTodayString(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Formats a Date object to a YYYY-MM-DD string in IST. */
export function toLocalDateString(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isSlotAvailable(
  startTime: string,
  duration: number,
  bookedSlots: Array<{ startTime: string; endTime: string; status: string }>
): boolean {
  const endTime = addHours(startTime, duration);
  const startMins = toMins(startTime);
  const endMins = toMins(endTime);

  for (const booked of bookedSlots) {
    if (booked.status === 'CANCELLED') continue;
    const bookedStartMins = toMins(booked.startTime);
    const bookedEndMins = toMins(booked.endTime);
    if (startMins < bookedEndMins && endMins > bookedStartMins) {
      return false;
    }
  }
  return true;
}
