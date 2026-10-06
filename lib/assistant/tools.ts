import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { addHours } from '@/lib/utils';
import { addIndiaCalendarDays, getIndiaClock, getPublicTimeSlotsForDate, isBookingStartPastInIndia, validatePublicBookingTime } from '@/lib/public-booking-time';
import { loadActiveSpecialOpening } from '@/lib/special-opening-server';
import { getVenueRemainingCapacity, hasBookingConflict, isVenueAtCapacityDuring, meetsStationMinimumDuration } from '@/lib/booking-availability';
import { createActionToken, quoteFingerprint } from '@/lib/assistant/tokens';
import { AssistantQuoteError, getBookingOptions, quoteBooking } from '@/lib/assistant/quote';
import { getSpinState } from '@/lib/daily-spin';
import type { AssistantCard, BookingDraft } from '@/types/assistant';

export type AssistantToolContext = {
  user: { id: string; email?: string | null } | null;
  requestUrl: string;
  cookieHeader: string;
};

export type AssistantToolResult = {
  output: Record<string, unknown>;
  cards?: AssistantCard[];
  preparedActions?: number;
};

const nullableString = { type: ['string', 'null'] } as const;
const nullableNumber = { type: ['number', 'null'] } as const;

export const ASSISTANT_TOOLS = [
  {
    type: 'function', name: 'get_stations_and_prices', strict: true,
    description: 'List active customer stations, public hourly prices, minimum durations, and station type.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    type: 'function', name: 'get_availability', strict: true,
    description: 'Find available public booking slots. Use null date for today, null duration for one hour, and searchDays up to 30 for next availability.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        date: nullableString,
        stationQuery: nullableString,
        afterTime: nullableString,
        duration: nullableNumber,
        quantity: { type: 'integer', minimum: 1, maximum: 6 },
        searchDays: { type: 'integer', minimum: 1, maximum: 30 },
      },
      required: ['date', 'stationQuery', 'afterTime', 'duration', 'quantity', 'searchDays'],
    },
  },
  {
    type: 'function', name: 'get_games', strict: true,
    description: 'Search the active public PS5 games catalogue. Catalogue presence is not a station-specific guarantee.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { query: nullableString, category: nullableString },
      required: ['query', 'category'],
    },
  },
  {
    type: 'function', name: 'get_my_bookings', strict: true,
    description: 'List only the signed-in customer’s bookings. Never use this for another customer.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { scope: { type: 'string', enum: ['UPCOMING', 'PAST', 'ALL'] } },
      required: ['scope'],
    },
  },
  {
    type: 'function', name: 'get_booking_options', strict: true,
    description: 'Get Standard, owned hour-pass, and owned Guild Membership options for an exact prospective booking.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        stationId: { type: 'string' }, date: { type: 'string' }, duration: { type: 'number' }, extraControllers: { type: 'integer' },
      },
      required: ['stationId', 'date', 'duration', 'extraControllers'],
    },
  },
  {
    type: 'function', name: 'get_daily_spin_status', strict: true,
    description: 'Check whether the signed-in customer can use Daily Spin and when it resets.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    type: 'function', name: 'prepare_booking', strict: true,
    description: 'Validate and quote one booking, then create a confirmation card. This never creates the booking.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        stationId: { type: 'string' }, date: { type: 'string' }, startTime: { type: 'string' }, duration: { type: 'number' },
        extraControllers: { type: 'integer', minimum: 0, maximum: 3 }, notes: nullableString,
        benefitMode: { type: 'string', enum: ['STANDARD', 'HOUR_PASS', 'GUILD'] },
        hourPassId: nullableString, appliedBenefitType: nullableString,
      },
      required: ['stationId', 'date', 'startTime', 'duration', 'extraControllers', 'notes', 'benefitMode', 'hourPassId', 'appliedBenefitType'],
    },
  },
  {
    type: 'function', name: 'prepare_cancellation', strict: true,
    description: 'Validate ownership and cancellability, then create a confirmation card. This never cancels the booking.',
    parameters: { type: 'object', additionalProperties: false, properties: { bookingId: { type: 'string' } }, required: ['bookingId'] },
  },
  {
    type: 'function', name: 'prepare_daily_spin', strict: true,
    description: 'Check Daily Spin eligibility and create a Spin Now confirmation card. This never performs the spin.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
] as const;

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

function loginResult(intent: Record<string, unknown>, description: string): AssistantToolResult {
  return {
    output: { authenticated: false, message: 'The customer must sign in before this action can be prepared.' },
    cards: [{ ...card('login', 'Sign in to continue', { intent }), description, actionLabel: 'Sign in', href: '/login' }],
  };
}

export async function executeAssistantTool(name: string, rawArgs: unknown, context: AssistantToolContext): Promise<AssistantToolResult> {
  if (name === 'get_stations_and_prices') {
    const stations = await prisma.station.findMany({
      where: { isActive: true },
      select: { id: true, name: true, description: true, hourlyRate: true, minDuration: true, hasControllers: true },
      orderBy: { position: 'asc' },
    });
    return { output: { stations }, cards: [card('stations', 'Stations & prices', { stations })] };
  }
  if (name === 'get_availability') {
    const availability = await getAvailability(rawArgs);
    return { output: availability, cards: [card('availability', 'Available slots', availability)] };
  }
  if (name === 'get_games') {
    const args = z.object({ query: z.string().max(80).nullable(), category: z.string().max(120).nullable() }).parse(rawArgs);
    const catalogue = await prisma.game.findMany({
      where: { isActive: true },
      select: { id: true, name: true, category: true },
      orderBy: [{ category: 'asc' }, { position: 'asc' }, { name: 'asc' }],
    });
    const query = args.query?.trim().toLocaleLowerCase('en-IN');
    const category = args.category?.trim().toLocaleLowerCase('en-IN');
    const games = catalogue.filter((game) => (
      (!query || game.name.toLocaleLowerCase('en-IN').includes(query))
      && (!category || game.category.toLocaleLowerCase('en-IN').includes(category))
    )).slice(0, 60);
    return { output: { games, caveat: 'Catalogue entries are not mapped to a specific station.' }, cards: [card('games', 'Games catalogue', { games })] };
  }
  if (name === 'get_my_bookings') {
    const args = z.object({ scope: z.enum(['UPCOMING', 'PAST', 'ALL']) }).parse(rawArgs);
    if (!context.user) return loginResult({ tool: name, args }, 'Sign in to view your bookings.');
    const today = getIndiaClock().date;
    const bookings = await prisma.booking.findMany({
      where: {
        userId: context.user.id,
        ...(args.scope === 'UPCOMING' ? { date: { gte: today }, status: { in: ['PENDING', 'CONFIRMED'] } } : {}),
        ...(args.scope === 'PAST' ? { OR: [{ date: { lt: today } }, { status: { in: ['CANCELLED', 'COMPLETED', 'CHECKED_IN'] } }] } : {}),
      },
      select: { id: true, date: true, startTime: true, endTime: true, duration: true, totalPrice: true, status: true, station: { select: { name: true } } },
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      take: 20,
    });
    return { output: { bookings }, cards: [card('bookings', 'My bookings', { bookings })] };
  }
  if (name === 'get_booking_options') {
    const args = z.object({ stationId: z.string(), date: z.string(), duration: z.number(), extraControllers: z.number().int() }).parse(rawArgs);
    if (!context.user) return loginResult({ tool: name, args }, 'Sign in to check your passes and membership benefits.');
    return { output: await getBookingOptions(context.user.id, args.stationId, args.date, args.duration, args.extraControllers) };
  }
  if (name === 'get_daily_spin_status') {
    if (!context.user) return loginResult({ tool: name }, 'Sign in to check your Daily Spin.');
    const spin = await getSpinState(context.user.id);
    return { output: { enabled: spin.settings.enabled, canSpin: spin.canSpin, nextReset: spin.nextReset.toISOString(), streak: spin.streak } };
  }
  if (name === 'prepare_booking') {
    const draft = bookingDraftSchema.parse(rawArgs) as BookingDraft;
    if (!context.user) return loginResult({ tool: name, draft }, 'Sign in to apply your benefits, verify the final price, and confirm.');
    const quote = await quoteBooking(context.user.id, draft);
    const token = createActionToken({ action: 'BOOKING', userId: context.user.id, draft, quoteHash: quoteFingerprint(quote) });
    return {
      output: { prepared: true, quote: { ...quote }, message: 'A confirmation card was shown. The booking has not been created.' },
      cards: [{ ...card('booking_confirmation', 'Confirm booking', { quote }), actionToken: token, actionLabel: 'Confirm booking' }],
      preparedActions: 1,
    };
  }
  if (name === 'prepare_cancellation') {
    const { bookingId } = z.object({ bookingId: z.string() }).parse(rawArgs);
    if (!context.user) return loginResult({ tool: name, bookingId }, 'Sign in to cancel your booking.');
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, userId: context.user.id },
      include: { station: { select: { name: true } } },
    });
    if (!booking) throw new AssistantQuoteError('Booking not found.', 'BOOKING_NOT_FOUND', 404);
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) throw new AssistantQuoteError('Only pending or confirmed bookings can be cancelled.', 'CANCELLATION_CLOSED', 409);
    if (isBookingStartPastInIndia(booking.date, booking.startTime, new Date(), 0)) throw new AssistantQuoteError('This booking has already started and can no longer be cancelled.', 'CANCELLATION_CLOSED', 409);
    const token = createActionToken({ action: 'CANCELLATION', userId: context.user.id, bookingId });
    const details = { id: booking.id, stationName: booking.station.name, date: booking.date, startTime: booking.startTime, endTime: booking.endTime, totalPrice: booking.totalPrice };
    return {
      output: { prepared: true, booking: details, message: 'A cancellation card was shown. The booking has not been cancelled.' },
      cards: [{ ...card('cancellation_confirmation', 'Cancel booking?', { booking: details }), description: 'Cancellation is final. Any reserved pass hours will be restored.', actionToken: token, actionLabel: 'Cancel booking' }],
      preparedActions: 1,
    };
  }
  if (name === 'prepare_daily_spin') {
    if (!context.user) return loginResult({ tool: name }, 'Sign in to claim your Daily Spin.');
    const spin = await getSpinState(context.user.id);
    if (!spin.settings.enabled) throw new AssistantQuoteError('Daily Spin is currently disabled.', 'SPIN_DISABLED', 403);
    if (!spin.canSpin) throw new AssistantQuoteError('Today’s spin is already used.', 'SPIN_UNAVAILABLE', 409);
    const { spinDate } = spin;
    const token = createActionToken({ action: 'DAILY_SPIN', userId: context.user.id, spinDate });
    return {
      output: { prepared: true, canSpin: true, nextReset: spin.nextReset.toISOString(), message: 'A Spin Now card was shown. The spin has not happened.' },
      cards: [{
        ...card('spin_confirmation', 'Daily Guild Spin', { eligible: true, nextReset: spin.nextReset.toISOString(), streak: spin.streak }),
        description: 'You are eligible to spin now. The reward is selected only after you confirm.',
        actionToken: token,
        actionLabel: 'Spin now',
      }],
      preparedActions: 1,
    };
  }
  throw new Error(`Unknown assistant tool: ${name}`);
}
