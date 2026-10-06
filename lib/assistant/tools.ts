import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { addHours } from '@/lib/utils';
import { addIndiaCalendarDays, getIndiaClock, getPublicTimeSlotsForDate, isBookingStartPastInIndia, validatePublicBookingTime } from '@/lib/public-booking-time';
import { loadActiveSpecialOpening } from '@/lib/special-opening-server';
import { getVenueRemainingCapacity, hasBookingConflict, isVenueAtCapacityDuring, meetsStationMinimumDuration } from '@/lib/booking-availability';
import { createActionToken, quoteFingerprint } from '@/lib/assistant/tokens';
import { AssistantQuoteError, quoteBooking } from '@/lib/assistant/quote';
import type { getSpinEligibility } from '@/lib/daily-spin';
import { canCancelOwnBooking } from './customer-scope';
import type { AssistantCard, BookingDraft } from '@/types/assistant';

const availabilitySchema = z.object({
  stationId: z.string().max(100).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  stationQuery: z.string().max(80).nullable(),
  afterTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  duration: z.number().min(0.5).max(12).nullable(),
  quantity: z.number().int().min(1).max(6),
  searchDays: z.number().int().min(1).max(30),
});

const bookingDraftSchema = z.object({
  stationId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startTime: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.number().min(0.5).max(12), extraControllers: z.number().int().min(0).max(3), notes: z.string().max(160).nullable(),
  benefitMode: z.enum(['STANDARD', 'HOUR_PASS', 'GUILD']), hourPassId: z.string().nullable(), appliedBenefitType: z.string().nullable(),
}).superRefine((draft, context) => {
  if (draft.benefitMode === 'STANDARD' && (draft.hourPassId || draft.appliedBenefitType)) {
    context.addIssue({ code: 'custom', message: 'Standard price cannot include a pass or membership.' });
  }
  if (draft.benefitMode === 'HOUR_PASS' && (!draft.hourPassId || draft.appliedBenefitType)) {
    context.addIssue({ code: 'custom', message: 'Select exactly one eligible hour pass.' });
  }
  if (draft.benefitMode === 'GUILD' && (!draft.appliedBenefitType || draft.hourPassId)) {
    context.addIssue({ code: 'custom', message: 'Select exactly one eligible Guild Membership.' });
  }
});

function card(kind: AssistantCard['kind'], title: string, data?: Record<string, unknown>): AssistantCard {
  return { id: crypto.randomUUID(), kind, title, data };
}

function stationMatches(station: { name: string; hasControllers: boolean }, query: string | null) {
  if (!query) return true;
  const term = query.trim().toLowerCase();
  if (!term) return true;
  if (term.includes('ps5') || term.includes('playstation') || term === 'ps') return station.hasControllers;
  if (term.includes('race') || term.includes('racing') || term.includes('sim')) return !station.hasControllers;
  return station.name.toLowerCase().includes(term);
}

export async function getAvailability(raw: unknown) {
  const args = availabilitySchema.parse(raw);
  const clock = getIndiaClock();
  const firstDate = args.date ?? clock.date;
  const maxDate = addIndiaCalendarDays(clock.date, 30)!;
  if (firstDate < clock.date || firstDate > maxDate) throw new AssistantQuoteError('Availability can be searched only within the next 30 days.', 'DATE_OUT_OF_RANGE');
  const duration = args.duration ?? 1;
  const stations = (await prisma.station.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } }))
    .filter((station) => (!args.stationId || station.id === args.stationId) && stationMatches(station, args.stationQuery));
  if (!stations.length) return { date: firstDate, duration, quantity: args.quantity, slots: [] };
  const specialOpening = await loadActiveSpecialOpening(new Date());
  const lastDate = [addIndiaCalendarDays(firstDate, args.searchDays - 1)!, maxDate].sort()[0];
  const [rangeBookings, capacitySetting] = await Promise.all([
    prisma.booking.findMany({ where: { date: { gte: firstDate, lte: lastDate }, status: { not: 'CANCELLED' } }, select: { date: true, stationId: true, startTime: true, endTime: true } }),
    prisma.setting.findUnique({ where: { key: 'venue_capacity' } }),
  ]);

  for (let offset = 0; offset < args.searchDays; offset += 1) {
    const date = addIndiaCalendarDays(firstDate, offset);
    if (!date || date > maxDate) break;
    const bookings = rangeBookings.filter((booking) => booking.date === date);
    const byTime = new Map<string, Array<{ stationId: string; stationName: string; startTime: string; endTime: string; hourlyRate: number }>>();
    for (const station of stations) {
      if (!meetsStationMinimumDuration(duration, station.minDuration)) continue;
      for (const startTime of getPublicTimeSlotsForDate(date, 30, specialOpening)) {
        if (args.afterTime && startTime < args.afterTime) continue;
        if (isBookingStartPastInIndia(date, startTime)) continue;
        const validation = validatePublicBookingTime(date, startTime, duration, specialOpening);
        if (!validation.valid) continue;
        const interval = { startTime, endTime: addHours(startTime, duration) };
        if (hasBookingConflict(interval, bookings.filter((booking) => booking.stationId === station.id))) continue;
        if (isVenueAtCapacityDuring(interval, bookings, capacitySetting?.value)) continue;
        const list = byTime.get(startTime) ?? [];
        list.push({ stationId: station.id, stationName: station.name, startTime, endTime: interval.endTime, hourlyRate: station.hourlyRate });
        byTime.set(startTime, list);
      }
    }
    const slots = [...byTime.entries()]
      .map(([startTime, entries]) => {
        const remainingCapacity = getVenueRemainingCapacity(
          { startTime, endTime: entries[0]?.endTime ?? startTime },
          bookings,
          capacitySetting?.value,
        );
        return { startTime, entries, availableCount: Math.min(entries.length, remainingCapacity) };
      })
      .filter(({ availableCount }) => availableCount >= args.quantity)
      .map(({ startTime, entries, availableCount }) => ({ startTime, availableCount, stations: entries }));
    if (slots.length) return { date, duration, quantity: args.quantity, slots };
  }
  return { date: firstDate, duration, quantity: args.quantity, slots: [] };
}


export async function getGames(query?: string) {
  const catalogue = await prisma.game.findMany({
    where: { isActive: true }, select: { id: true, name: true },
    orderBy: [{ category: 'asc' }, { position: 'asc' }, { name: 'asc' }],
  });
  const term = query?.trim().toLocaleLowerCase('en-IN');
  return catalogue.filter((game) => !term || game.name.toLocaleLowerCase('en-IN').includes(term)).slice(0, 60);
}

export async function prepareBooking(userId: string, raw: unknown): Promise<AssistantCard> {
  const draft = bookingDraftSchema.parse(raw) as BookingDraft;
  const quote = await quoteBooking(userId, draft);
  return { ...card('booking_confirmation', 'Confirm booking', { quote }),
    actionToken: createActionToken({ action: 'BOOKING', userId, draft, quoteHash: quoteFingerprint(quote) }), actionLabel: 'Confirm booking' };
}

export async function prepareCancellation(userId: string, bookingId: string): Promise<AssistantCard> {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId }, include: { station: { select: { name: true } } } });
  if (!booking) throw new AssistantQuoteError('Booking not found.', 'BOOKING_NOT_FOUND', 404);
  if (!canCancelOwnBooking(booking, userId)) throw new AssistantQuoteError('This booking can no longer be cancelled.', 'CANCELLATION_CLOSED', 409);
  const details = { id: booking.id, stationName: booking.station.name, date: booking.date, startTime: booking.startTime, endTime: booking.endTime, totalPrice: booking.totalPrice };
  return { ...card('cancellation_confirmation', 'Cancel booking?', { booking: details }),
    description: 'Cancellation is final. Any reserved pass hours will be restored.',
    actionToken: createActionToken({ action: 'CANCELLATION', userId, bookingId }), actionLabel: 'Cancel booking' };
}

export function prepareDailySpin(userId: string, spin: Awaited<ReturnType<typeof getSpinEligibility>>): AssistantCard {
  if (!spin.settings.enabled || !spin.canSpin) throw new AssistantQuoteError('Daily Spin is unavailable.', 'SPIN_UNAVAILABLE', 409);
  return { ...card('spin_confirmation', 'Daily Guild Spin', { eligible: true, nextReset: spin.nextReset.toISOString() }),
    description: 'You are eligible to spin now. The reward is selected only after you confirm.',
    actionToken: createActionToken({ action: 'DAILY_SPIN', userId, spinDate: spin.spinDate }), actionLabel: 'Spin now' };
}
