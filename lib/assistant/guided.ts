import { prisma } from '@/lib/prisma';
import { addIndiaCalendarDays, getIndiaClock, validatePublicBookingTime } from '@/lib/public-booking-time';
import { loadActiveSpecialOpening } from '@/lib/special-opening-server';
import { addHours } from '@/lib/utils';
import { hasBookingConflict, isVenueAtCapacityDuring } from '@/lib/booking-availability';
import { getSpinState } from '@/lib/daily-spin';
import { canCancelOwnBooking } from './customer-scope';
import { executeAssistantTool, getAvailability, type AssistantToolContext } from './tools';
import { dateLabel, priceLabel, timeLabel, guidedStateSchema } from './flow-state';
import type { GuidedState, GuidedView, GuidedOption } from '@/types/assistant';

export const HOME_OPTIONS: GuidedOption[] = [
  ['Book a Slot', 'BOOK'], ['Next Available', 'NEXT'], ['My Bookings', 'BOOKINGS'],
  ['Daily Spin', 'SPIN'], ['Games', 'GAMES'], ['Prices', 'PRICES'],
].map(([label, task]) => ({ label, state: { task: task as GuidedState['task'] } }));

export async function getGuidedView(raw: unknown, context: AssistantToolContext): Promise<GuidedView> {
  const state = guidedStateSchema.parse(raw);
  const today = getIndiaClock().date;
  const dates = Array.from({ length: 31 }, (_, i) => addIndiaCalendarDays(today, i)!);
  const view = (title: string, options: GuidedOption[] = [], extra: Partial<GuidedView> = {}): GuidedView => ({ state, title, options, ...extra });
  const option = (label: string, patch: Partial<GuidedState>, detail?: string): GuidedOption => ({ label, detail, state: { ...state, ...patch } });
  const tool = (name: string, args: unknown) => executeAssistantTool(name, args, context);
  const prepared = async (name: string, args: unknown) => {
    const result = await tool(name, args);
    return view(result.cards?.[0]?.title ?? 'Review', [], { card: result.cards?.[0] });
  };
  const login = () => view('Sign in to continue', [], { login: true, description: 'Your selections will be kept.' });
  if (state.task === 'HOME') return view("Hi, I'm Emiily! How can I help you today?", HOME_OPTIONS);
  if (state.date && !dates.includes(state.date)) throw new Error('Choose a date within the next 30 days.');

  if (state.task === 'SPIN') {
    if (!context.user) return login();
    const spin = await getSpinState(context.user.id);
    if (!spin.settings.enabled) return view('Daily Spin is currently disabled.');
    if (!spin.canSpin) return view('Today’s spin is used', [], { description: `Next reset: ${new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(spin.nextReset)} IST.` });
    return prepared('prepare_daily_spin', {});
  }
  if (state.task === 'BOOKINGS') {
    if (!context.user) return login();
    if (state.bookingId && state.cancel) return prepared('prepare_cancellation', { bookingId: state.bookingId });
    const bookings = await prisma.booking.findMany({
      where: { userId: context.user.id, date: { gte: today }, status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] } },
      select: { id: true, userId: true, date: true, startTime: true, endTime: true, totalPrice: true, status: true, duration: true, station: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take: 30,
    });
    if (state.bookingId) {
      const booking = bookings.find((item) => item.id === state.bookingId);
      if (!booking) throw new Error('Booking not found.');
      return view(booking.station.name, canCancelOwnBooking(booking, context.user.id) ? [option('Cancel booking', { cancel: true })] : [], {
        description: `${dateLabel(booking.date, today)} · ${timeLabel(booking.startTime)}–${timeLabel(booking.endTime)} IST · ${priceLabel(booking.totalPrice)} · ${booking.status}`,
      });
    }
    return view(bookings.length ? 'My upcoming bookings' : 'No upcoming bookings', bookings.map((booking) => option(
      booking.station.name, { bookingId: booking.id }, `${dateLabel(booking.date, today)} · ${timeLabel(booking.startTime)}–${timeLabel(booking.endTime)} IST · ${priceLabel(booking.totalPrice)}`,
    )));
  }
  const stations = await prisma.station.findMany({ where: { isActive: true }, select: { id: true, name: true, hourlyRate: true, minDuration: true, hasControllers: true }, orderBy: { position: 'asc' } });
  if (state.task === 'PRICES') return view('Stations & prices', stations.map((station) => ({
    label: station.name, detail: `${priceLabel(station.hourlyRate)}/hr · min ${station.minDuration} hr`, state: { task: 'BOOK', stationId: station.id },
  })));

  if (state.task === 'GAMES' || (state.task === 'BOOK' && state.stationId && state.date && state.startTime && state.duration !== undefined && state.extraControllers !== undefined && !state.gameChosen)) {
    const result = await tool('get_games', { query: state.query ?? null, category: null });
    const games = result.output.games as Array<{ id: string; name: string }>;
    const gameOptions: GuidedOption[] = games.map((game) => ({ label: game.name, state: state.task === 'GAMES'
      ? { task: 'BOOK', notes: game.name, gameChosen: true }
      : { ...state, notes: game.name, gameChosen: true, query: undefined } }));
    if (state.task === 'BOOK') gameOptions.unshift(option('No game request', { notes: '', gameChosen: true, query: undefined }));
    return view(state.task === 'GAMES' ? 'Games' : 'Game request (optional)', gameOptions, {
      description: 'Requests depend on availability at your station.', search: true, customGame: state.task === 'BOOK',
    });
  }

  if (state.task === 'NEXT') {
    if (!state.search) return view('Find the next available slot', [], { nextFilters: { stations, dates } });
    const result = await getAvailability({ date: state.date ?? null, stationId: state.stationId, stationQuery: state.stationQuery ?? null,
      afterTime: state.afterTime ?? null, duration: state.duration ?? 1, quantity: state.quantity ?? 1, searchDays: 30 });
    const offset = state.offset ?? 0;
    const slot = result.slots[offset];
    if (!slot) return view('No matching slots found', [option('Change options', { search: false, offset: 0 })]);
    const quantity = state.quantity ?? 1;
    const bookingSelection: GuidedState = {
      task: 'BOOK', date: result.date, startTime: slot.startTime, duration: result.duration,
      extraControllers: state.extraControllers, notes: state.notes, gameChosen: state.gameChosen,
    };
    const choices: GuidedOption[] = quantity > 1 ? [{
      label: `Book these ${quantity} stations`,
      detail: slot.stations.slice(0, quantity).map((s) => `${s.stationName} · ${priceLabel(s.hourlyRate * result.duration)}`).join(' / '),
      state: { ...bookingSelection, stationId: slot.stations[0].stationId, queue: slot.stations.slice(1, quantity).map((s) => s.stationId) },
    }] : slot.stations.map((s) => ({
      label: `Book ${s.stationName}`, detail: priceLabel(s.hourlyRate * result.duration),
      state: { ...bookingSelection, stationId: s.stationId },
    }));
    if (offset + 1 < result.slots.length) choices.push(option('More times', { offset: offset + 1 }));
    else if (result.date < dates[30]) choices.push(option('Search next day', { date: addIndiaCalendarDays(result.date, 1)!, offset: 0 }));
    choices.push(option('Change options', { search: false, offset: 0 }));
    return view(`${dateLabel(result.date, today)} · ${timeLabel(slot.startTime)}–${timeLabel(slot.stations[0].endTime)} IST`, choices,
      quantity > 1 ? { description: 'Each station needs its own confirmation.' } : {});
  }

  // Booking choices are recomputed from current authoritative data at every step.
  const station = stations.find((s) => s.id === state.stationId);
  if (!station) {
    const matching = stations.filter((s) => !state.stationQuery || s.name.toLowerCase().includes(state.stationQuery.toLowerCase())
      || (/ps5|playstation/i.test(state.stationQuery) && s.hasControllers) || (/racing|simulator/i.test(state.stationQuery) && !s.hasControllers));
    const exact = stations.find((s) => s.name.toLowerCase() === state.stationQuery?.trim().toLowerCase());
    if (exact) return getGuidedView({ ...state, stationId: exact.id, stationQuery: undefined }, context);
    return view('Choose a station', (matching.length ? matching : stations).map((s) => option(s.name, { stationId: s.id, stationQuery: undefined }, `${priceLabel(s.hourlyRate)}/hr`)));
  }
  if (!state.date) return view('Choose a date', dates.map((date) => option(dateLabel(date, today), { date })));
  const durations = Array.from({ length: 24 }, (_, i) => (i + 1) / 2).filter((d) => d >= station.minDuration);
  const available = await getAvailability({ date: state.date, stationId: station.id, stationQuery: null, afterTime: null,
    duration: state.duration ?? durations[0], quantity: 1, searchDays: 1 });
  if (!state.startTime) return view('Choose a time', available.slots.map((slot) => option(timeLabel(slot.startTime), { startTime: slot.startTime })),
    available.slots.length ? {} : { description: 'No matching times. Go back to choose another date.' });
  if (!available.slots.some((slot) => slot.startTime === state.startTime)) throw new Error('That slot is no longer available. Change the time to continue.');
  if (state.duration === undefined) {
    const [bookings, capacity, opening] = await Promise.all([
      prisma.booking.findMany({ where: { date: state.date, status: { not: 'CANCELLED' } }, select: { stationId: true, startTime: true, endTime: true } }),
      prisma.setting.findUnique({ where: { key: 'venue_capacity' } }), loadActiveSpecialOpening(),
    ]);
    const valid = durations.filter((duration) => {
      const interval = { startTime: state.startTime!, endTime: addHours(state.startTime!, duration) };
      return validatePublicBookingTime(state.date!, state.startTime!, duration, opening).valid
        && !hasBookingConflict(interval, bookings.filter((b) => b.stationId === station.id))
        && !isVenueAtCapacityDuring(interval, bookings, capacity?.value);
    });
    return view('Choose duration', valid.map((duration) => option(`${duration} hr`, { duration }, priceLabel(station.hourlyRate * duration))));
  }
  if (state.extraControllers === undefined) {
    if (!station.hasControllers) return getGuidedView({ ...state, extraControllers: 0 }, context);
    const setting = await prisma.setting.findUnique({ where: { key: 'controller_price' } });
    const price = Number(setting?.value ?? 0);
    return view('How many controllers?', [0, 1, 2, 3].map((extraControllers) => option(`${extraControllers + 1} controller${extraControllers ? 's' : ''}`, { extraControllers }, extraControllers ? `+${priceLabel(price * extraControllers * state.duration!)}` : 'Included')));
  }
  if (!state.gameChosen) return getGuidedView({ ...state }, context);
  if (!context.user) return login();
  if (!state.benefitMode) {
    const { output } = await tool('get_booking_options', { stationId: station.id, date: state.date, duration: state.duration, extraControllers: state.extraControllers });
    const passes = output.hourPasses as Array<{ id: string; passType: string; remainingHours: number; eligible: boolean }>;
    const guild = output.guild as { passType: string; label: string; eligible: boolean } | null;
    const choices = [option('Standard', { benefitMode: 'STANDARD', hourPassId: undefined, appliedBenefitType: undefined }, 'Pay at venue')];
    for (const pass of passes.filter((p) => p.eligible)) choices.push(option(`${pass.passType} Hour Pass`, { benefitMode: 'HOUR_PASS', hourPassId: pass.id, appliedBenefitType: undefined }, `${pass.remainingHours} hr remaining`));
    if (guild?.eligible) choices.push(option(guild.label, { benefitMode: 'GUILD', appliedBenefitType: guild.passType, hourPassId: undefined }, '50% discount · pay at venue'));
    return view('Choose a benefit', choices);
  }
  return prepared('prepare_booking', { stationId: station.id, date: state.date, startTime: state.startTime, duration: state.duration,
    extraControllers: state.extraControllers, notes: state.notes || null, benefitMode: state.benefitMode,
    hourPassId: state.hourPassId ?? null, appliedBenefitType: state.appliedBenefitType ?? null });
}
