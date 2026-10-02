import { z } from 'zod';
import type { GuidedState } from '@/types/assistant';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[03]0$/);
export const guidedStateSchema = z.object({
  task: z.enum(['HOME', 'BOOK', 'NEXT', 'BOOKINGS', 'SPIN', 'GAMES', 'PRICES']),
  stationId: z.string().min(1).max(100).optional(), stationQuery: z.string().max(80).optional(),
  date: date.optional(), startTime: time.optional(), duration: z.number().min(0.5).max(12).multipleOf(0.5).optional(),
  extraControllers: z.number().int().min(0).max(3).optional(), notes: z.string().trim().max(160).optional(),
  gameChosen: z.boolean().optional(), benefitMode: z.enum(['STANDARD', 'HOUR_PASS', 'GUILD']).optional(),
  hourPassId: z.string().max(100).optional(), appliedBenefitType: z.string().max(80).optional(),
  quantity: z.number().int().min(1).max(6).optional(), afterTime: time.optional(),
  query: z.string().max(80).optional(), offset: z.number().int().min(0).max(100).optional(),
  search: z.boolean().optional(), bookingId: z.string().max(100).optional(), cancel: z.boolean().optional(),
  queue: z.array(z.string().max(100)).max(6).optional(), completed: z.array(z.string().max(100)).max(6).optional(),
}).strict();

// Upstream edits invalidate every downstream decision, including old confirmation cards.
export function changeSelection(state: GuidedState, field: 'stationId' | 'date' | 'startTime' | 'duration' | 'extraControllers' | 'notes'): GuidedState {
  const next = { ...state };
  const order = ['stationId', 'date', 'startTime', 'duration', 'extraControllers', 'notes', 'gameChosen', 'benefitMode', 'hourPassId', 'appliedBenefitType'] as const;
  for (const key of order.slice(order.indexOf(field))) delete next[key];
  if (field === 'stationId' || field === 'date' || field === 'startTime' || field === 'duration') {
    delete next.queue;
  }
  return next;
}

export function timeLabel(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}
export function dateLabel(date: string, today?: string) {
  return date === today ? 'Today' : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(`${date}T12:00:00+05:30`));
}
export function priceLabel(value: number) { return `₹${value.toLocaleString('en-IN')}`; }

export function guidedWindow(previous: { guidedWindowStart: number; guidedWindowCount: number }, now: number, limit: number) {
  const minute = Math.floor(now / 60_000);
  const count = previous.guidedWindowStart === minute ? previous.guidedWindowCount : 0;
  return { allowed: count < limit, guidedWindowStart: minute, guidedWindowCount: count < limit ? count + 1 : count };
}
