import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { bookingSchema } from '@/lib/validations';
import { addHours } from '@/lib/utils';
import { loadActiveSpecialOpening } from '@/lib/special-opening-server';
import { hasBookingConflict, isVenueAtCapacityDuring, meetsStationMinimumDuration } from '@/lib/booking-availability';
import { addIndiaCalendarDays, getIndiaClock, isBookingStartPastInIndia, validatePublicBookingTime } from '@/lib/public-booking-time';
import { isPassDateEligible, PASS_WEEKDAY_ONLY_ERROR } from '@/lib/pass-rules';
import {
  GUILD_MEMBERSHIP_DISCOUNT_PERCENTAGE,
  getGuildMembershipDiscountedTotal,
  guildMembershipName,
  isGuildMembershipType,
  selectPreferredGuildMembership,
  validateGuildBenefitApplication,
} from '@/lib/guild-membership';
import type { BookingDraft, BookingQuote } from '@/types/assistant';

const CONTROLLER_PASSES = new Set(['BRONZE', 'SILVER', 'GOLD']);
const SIMULATOR_PASSES = new Set(['BLACK', 'APEX']);

export class AssistantQuoteError extends Error {
  constructor(message: string, readonly code = 'INVALID_BOOKING', readonly status = 400) {
    super(message);
  }
}

function passAllowed(passType: string, hasControllers: boolean) {
  return hasControllers ? CONTROLLER_PASSES.has(passType) : SIMULATOR_PASSES.has(passType);
}

export async function getBookingOptions(userId: string, stationId: string, date: string, duration: number, extraControllers: number) {
  const now = new Date();
  const [station, passes] = await Promise.all([
    prisma.station.findFirst({ where: { id: stationId, isActive: true } }),
    prisma.userPass.findMany({
      where: { userId, status: 'ACTIVE', expiresAt: { gte: now } },
      orderBy: { purchasedAt: 'desc' },
    }),
  ]);
  if (!station) throw new AssistantQuoteError('Station not found.', 'STATION_NOT_FOUND', 404);
  const hourPasses = passes.filter((pass) => !isGuildMembershipType(pass.passType)).map((pass) => ({
    id: pass.id,
    passType: pass.passType,
    remainingHours: pass.totalHours - pass.usedHours,
    eligible: passAllowed(pass.passType, station.hasControllers)
      && isPassDateEligible(date)
      && pass.totalHours - pass.usedHours >= duration,
  }));
  const membership = selectPreferredGuildMembership(passes, now);
  const guildValidation = validateGuildBenefitApplication({
    requestedBenefit: membership?.passType,
    membership,
    bookingDate: date,
    hasControllers: station.hasControllers,
    extraControllers,
    discount: GUILD_MEMBERSHIP_DISCOUNT_PERCENTAGE,
    hasLinkedUser: true,
    hasHourPass: false,
    now,
  });
  return {
    station: { id: station.id, name: station.name, hourlyRate: station.hourlyRate, hasControllers: station.hasControllers },
    standard: { eligible: true },
    hourPasses,
    guild: membership ? {
      passType: membership.passType,
      label: guildMembershipName(membership.passType),
      eligible: guildValidation.valid,
      reason: guildValidation.reason,
    } : null,
  };
}

export async function quoteBooking(userId: string, draft: BookingDraft, db: Prisma.TransactionClient = prisma): Promise<BookingQuote> {
  const parsed = bookingSchema.safeParse({ ...draft, notes: draft.notes ?? undefined });
  if (!parsed.success) throw new AssistantQuoteError(parsed.error.issues[0]?.message ?? 'Invalid booking details.');
  const now = new Date();
  const today = getIndiaClock(now).date;
  if (draft.date < today || draft.date > addIndiaCalendarDays(today, 30)!) throw new AssistantQuoteError('Choose a date within the next 30 days.', 'DATE_OUT_OF_RANGE');
  const specialOpening = await loadActiveSpecialOpening(now);
  const timeValidation = validatePublicBookingTime(draft.date, draft.startTime, draft.duration, specialOpening);
  if (!timeValidation.valid) throw new AssistantQuoteError(timeValidation.reason, timeValidation.code);
  if (isBookingStartPastInIndia(draft.date, draft.startTime, now)) {
    throw new AssistantQuoteError('Cannot book a time slot that has already passed.', 'PAST_SLOT');
  }
  const [station, user, controllerSetting, capacitySetting, bookings] = await Promise.all([
    db.station.findFirst({ where: { id: draft.stationId, isActive: true } }),
    db.user.findUnique({
      where: { id: userId },
      include: { passes: { where: { status: 'ACTIVE', expiresAt: { gte: now } }, orderBy: { purchasedAt: 'desc' } } },
    }),
    db.setting.findUnique({ where: { key: 'controller_price' } }),
    db.setting.findUnique({ where: { key: 'venue_capacity' } }),
    db.booking.findMany({
      where: { date: draft.date, status: { not: 'CANCELLED' } },
      select: { stationId: true, startTime: true, endTime: true },
    }),
  ]);
  if (!station) throw new AssistantQuoteError('Station not found or inactive.', 'STATION_NOT_FOUND', 404);
  if (!user) throw new AssistantQuoteError('Customer account not found.', 'USER_NOT_FOUND', 404);
  if (!meetsStationMinimumDuration(draft.duration, station.minDuration)) {
    throw new AssistantQuoteError(`This station requires a minimum ${station.minDuration}-hour session.`, 'MINIMUM_DURATION');
  }
  const endTime = addHours(draft.startTime, draft.duration);
  const interval = { startTime: draft.startTime, endTime };
  if (hasBookingConflict(interval, bookings.filter((booking) => booking.stationId === station.id))) {
    throw new AssistantQuoteError('This time slot is already booked.', 'STATION_CONFLICT', 409);
  }
  if (isVenueAtCapacityDuring(interval, bookings, capacitySetting?.value)) {
    throw new AssistantQuoteError('The venue is fully booked at this time.', 'VENUE_FULL', 409);
  }
  const extraControllers = station.hasControllers ? Math.min(3, Math.max(0, Math.trunc(draft.extraControllers))) : 0;
  const controllerUnitPrice = Number(controllerSetting?.value ?? 0) || 0;
  const controllerCharge = extraControllers * controllerUnitPrice * draft.duration;
  const sessionPrice = station.hourlyRate * draft.duration;
  const normalPrice = sessionPrice + controllerCharge;
  let totalPrice = normalPrice;
  let discount = 0;
  let benefitLabel = 'Standard price';
  let passHoursRemaining: number | null = null;

  if (draft.benefitMode === 'HOUR_PASS') {
    if (!isPassDateEligible(draft.date)) throw new AssistantQuoteError(PASS_WEEKDAY_ONLY_ERROR, 'PASS_WEEKDAY_ONLY');
    const pass = user.passes.find((candidate) => candidate.id === draft.hourPassId);
    if (!pass || isGuildMembershipType(pass.passType)) throw new AssistantQuoteError('Select an active hour pass.', 'PASS_NOT_FOUND');
    if (!passAllowed(pass.passType, station.hasControllers)) throw new AssistantQuoteError('This pass cannot be used on this station.', 'PASS_STATION_MISMATCH');
    const remaining = pass.totalHours - pass.usedHours;
    if (remaining < draft.duration) throw new AssistantQuoteError(`Only ${remaining} pass hour(s) remain.`, 'PASS_HOURS_INSUFFICIENT');
    totalPrice = controllerCharge;
    benefitLabel = `${pass.passType} hour pass`;
    passHoursRemaining = remaining - draft.duration;
  } else if (draft.benefitMode === 'GUILD') {
    const membership = user.passes.find((candidate) => candidate.passType === draft.appliedBenefitType) ?? null;
    const validation = validateGuildBenefitApplication({
      requestedBenefit: draft.appliedBenefitType,
      membership,
      bookingDate: draft.date,
      hasControllers: station.hasControllers,
      extraControllers,
      discount: GUILD_MEMBERSHIP_DISCOUNT_PERCENTAGE,
      hasLinkedUser: true,
      hasHourPass: false,
      now,
    });
    if (!validation.valid) throw new AssistantQuoteError(validation.reason, validation.code);
    discount = GUILD_MEMBERSHIP_DISCOUNT_PERCENTAGE;
    totalPrice = getGuildMembershipDiscountedTotal(normalPrice);
    benefitLabel = guildMembershipName(validation.benefitType);
  }

  return {
    ...draft,
    extraControllers,
    stationName: station.name,
    endTime,
    hourlyRate: station.hourlyRate,
    controllerUnitPrice,
    controllerCharge,
    normalPrice,
    discount,
    totalPrice,
    benefitLabel,
    passHoursRemaining,
  };
}
