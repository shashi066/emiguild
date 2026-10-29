import { z } from 'zod';
import { bookingSchema } from './validations';
import { adminGameRequestSchema } from './game-request';
import { applyHappyTicket, restoreHappyTicket } from './happy-tickets';
import { happyBookingProblem, readHappyConfig } from './happy-ticket-rules';
import { calculateHourPassUsageUpdates, validateHourPassApplication } from './hour-pass';
import { isGuildMembershipType, validateGuildBenefitApplication } from './guild-membership';
import { validateAdminWalkinTime } from './admin-walkin-time';
import { validatePublicBookingTime } from './public-booking-time';
import { loadActiveSpecialOpening } from './special-opening-server';
import { hasBookingConflict, isVenueAtCapacityDuring, meetsStationMinimumDuration } from './booking-availability';
import { addHours } from './utils';
import { audit, receipt, requestIdSchema, requireCurrentUser, RewardError, rewardTransaction, saveReceipt } from './november';

export const happyBookingInclude = {
  user: { select: { id: true, name: true, email: true } }, station: true, userPass: true,
  happyRedemptions: { orderBy: { createdAt: 'desc' as const }, select: {
    id: true, ticketId: true, status: true, discount: true, createdAt: true, restoredAt: true,
    ticket: { select: { expiresAt: true, rulesSnapshot: true } },
  } },
} as const;

const schema = bookingSchema.omit({ notes: true }).extend({
  notes: adminGameRequestSchema,
  extraControllers: z.number().int().min(0).max(3).optional(),
  customerName: z.string().trim().max(150).nullable().optional(),
  customerPhone: z.string().trim().max(30).nullable().optional(),
  discount: z.number().int().min(0).max(100).optional(),
  benefitMode: z.enum(['STANDARD', 'HOUR_PASS', 'GUILD', 'HAPPY_TICKET']).optional(),
  happyTicketId: z.string().min(1).nullable().optional(),
  hourPassId: z.string().nullable().optional(),
  appliedBenefitType: z.string().nullable().optional(),
  requestId: requestIdSchema.optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

/** One transaction covers the booking, released benefits, ticket history and replay receipt. */
export async function editHappyBooking(actorId: string, bookingId: string, raw: unknown, now = new Date()) {
  const body = schema.parse(raw);
  const { requestId, ...input } = body;
  if (requestId && !body.expectedUpdatedAt) throw new RewardError('STALE_EDIT', 'Refresh this booking before editing.', 409);
  const payload = { bookingId, ...input };
  const opening = await loadActiveSpecialOpening(now);
  return rewardTransaction(async tx => {
    await requireCurrentUser(actorId, tx, true);
    if (requestId) {
      const saved = await receipt<{ booking: Awaited<ReturnType<typeof tx.booking.findUniqueOrThrow>> }>(tx, actorId, 'ADMIN_BOOKING_EDIT', requestId, payload);
      if (saved) return saved.booking;
    }
    const current = await tx.booking.findUnique({ where: { id: bookingId }, include: { userPass: true } });
    if (!current) throw new RewardError('NOT_FOUND', 'Booking not found.', 404);
    if (body.expectedUpdatedAt && current.updatedAt.toISOString() !== body.expectedUpdatedAt) throw new RewardError('STALE_EDIT', 'This booking changed. Refresh before saving.', 409);
    const active = await tx.happyRedemption.findFirst({ where: { bookingId, status: 'APPLIED' }, include: { ticket: true } });
    const oldMode = active ? 'HAPPY_TICKET' : current.passHoursDeducted > 0 ? 'HOUR_PASS' : current.appliedBenefitType ? 'GUILD' : 'STANDARD';
    // Legacy/full edits that omit benefit controls must preserve the current benefit.
    if (body.benefitMode === undefined) {
      body.hourPassId ??= oldMode === 'HOUR_PASS' ? current.userPassId : undefined;
      body.appliedBenefitType ??= oldMode === 'GUILD' ? current.appliedBenefitType : undefined;
      body.discount ??= current.discount;
    }
    const mode = body.benefitMode ?? oldMode;
    const ticketId = mode === 'HAPPY_TICKET' ? body.happyTicketId ?? active?.ticketId : null;
    const controllers = body.extraControllers ?? current.extraControllers;
    const sessionChanged = body.stationId !== current.stationId || body.date !== current.date || body.startTime !== current.startTime || body.duration !== current.duration || controllers !== current.extraControllers;
    const benefitChanged = mode !== oldMode || (mode === 'HAPPY_TICKET' && ticketId !== active?.ticketId) || (body.discount ?? 0) !== current.discount || (mode === 'HOUR_PASS' && body.hourPassId !== current.userPassId) || (mode === 'GUILD' && body.appliedBenefitType !== current.appliedBenefitType);
    const economicChange = sessionChanged || benefitChanged;
    const metadata = {
      ...(Object.prototype.hasOwnProperty.call(raw, 'notes') ? { notes: body.notes ?? null } : {}),
      ...(body.customerName !== undefined ? { customerName: body.customerName } : {}),
      ...(body.customerPhone !== undefined ? { customerPhone: body.customerPhone } : {}),
    };
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    let updated;
    if (!economicChange) {
      updated = await tx.booking.update({ where: { id: bookingId }, data: { ...metadata, updatedAt }, include: happyBookingInclude });
    } else {
      if (!['PENDING', 'CONFIRMED'].includes(current.status)) throw new RewardError('BOOKING_ENDED', 'Only pending or confirmed bookings can change their session or benefits.', 409);
      const touchesHappy = Boolean(active || ticketId);
      if (touchesHappy && new Date(`${current.date}T${current.startTime}:00+05:30`) <= now) throw new RewardError('BOOKING_STARTED', 'The session has already started.', 409);
      if (touchesHappy && benefitChanged && current.paymentStatus === 'PAID') throw new RewardError('PAID_PRICE_CHANGE', 'A paid booking cannot change ticket benefits.', 409);
      const station = await tx.station.findUnique({ where: { id: body.stationId } });
      if (!station?.isActive || !meetsStationMinimumDuration(body.duration, station.minDuration)) throw new RewardError('INVALID_STATION', 'Station or minimum duration is invalid.');
      if (!station.hasControllers && controllers > 0) throw new RewardError('INVALID_CONTROLLERS', 'This station does not support extra controllers.');
      const time = current.bookingType === 'OFFLINE' && !ticketId
        ? validateAdminWalkinTime(body.startTime, body.duration)
        : validatePublicBookingTime(body.date, body.startTime, body.duration, opening);
      if (!time.valid) throw new RewardError('INVALID_TIME', time.reason);
      const endTime = addHours(body.startTime, body.duration);
      const [others, capacity, controller] = await Promise.all([
        tx.booking.findMany({ where: { id: { not: bookingId }, date: body.date, status: { not: 'CANCELLED' } }, select: { stationId: true, startTime: true, endTime: true } }),
        tx.setting.findUnique({ where: { key: 'venue_capacity' } }), tx.setting.findUnique({ where: { key: 'controller_price' } }),
      ]);
      const interval = { startTime: body.startTime, endTime };
      if (hasBookingConflict(interval, others.filter(b => b.stationId === body.stationId)) || isVenueAtCapacityDuring(interval, others, capacity?.value)) throw new RewardError('BOOKING_CONFLICT', 'This session is unavailable.', 409);
      if (mode !== 'STANDARD' && mode !== 'GUILD' && ((body.discount ?? 0) !== 0 || body.appliedBenefitType)) throw new RewardError('BENEFIT_STACKING', 'Choose only one booking benefit.');
      if (mode !== 'HOUR_PASS' && body.hourPassId) throw new RewardError('BENEFIT_STACKING', 'Choose only one booking benefit.');
      if (mode !== 'GUILD' && body.appliedBenefitType) throw new RewardError('BENEFIT_STACKING', 'Choose only one booking benefit.');
      if (mode !== 'HAPPY_TICKET' && body.happyTicketId) throw new RewardError('BENEFIT_STACKING', 'Choose only one booking benefit.');
      const selectedPass = mode === 'HOUR_PASS' && current.userId && body.hourPassId
        ? await tx.userPass.findFirst({ where: { id: body.hourPassId, userId: current.userId } }) : null;
      if (mode === 'HOUR_PASS') {
        const validation = validateHourPassApplication({ pass: selectedPass, userId: current.userId, bookingDate: body.date, duration: body.duration, hasControllers: station.hasControllers, currentPassId: current.userPassId, currentPassHours: current.passHoursDeducted, now });
        if (!validation.valid) throw new RewardError(validation.code, validation.reason);
      }
      let appliedBenefitType: string | null = null;
      const discount = mode === 'STANDARD' || mode === 'GUILD' ? body.discount ?? 0 : 0;
      if (mode === 'GUILD') {
        const membership = current.userId && isGuildMembershipType(body.appliedBenefitType) ? await tx.userPass.findFirst({ where: { userId: current.userId, passType: body.appliedBenefitType, status: 'ACTIVE', expiresAt: { gte: now } }, orderBy: { expiresAt: 'desc' } }) : null;
        const validation = validateGuildBenefitApplication({ requestedBenefit: body.appliedBenefitType, membership, bookingDate: body.date, hasControllers: station.hasControllers, extraControllers: controllers, discount, hasLinkedUser: !!current.userId, hasHourPass: false, now });
        if (!validation.valid) throw new RewardError(validation.code, validation.reason);
        appliedBenefitType = validation.benefitType;
      }
      let happyDiscount = 0;
      if (active && active.ticketId !== ticketId) await restoreHappyTicket(tx, bookingId, now);
      if (mode === 'HAPPY_TICKET') {
        if (!ticketId || !current.userId) throw new RewardError('INVALID_TICKET', 'Select a ticket owned by this customer.');
        if (active?.ticketId === ticketId) {
          if (active.ticket.status !== 'REDEEMED') throw new RewardError('INVALID_TICKET', 'Ticket state changed. Refresh first.', 409);
          const problem = happyBookingProblem({ ...body, config: readHappyConfig(active.ticket.rulesSnapshot), hasControllers: station.hasControllers, expiresAt: active.ticket.expiresAt, now });
          if (problem) throw new RewardError('TICKET_INELIGIBLE', problem, 409);
          happyDiscount = station.hourlyRate;
          await tx.happyRedemption.update({ where: { id: active.id }, data: { discount: happyDiscount } });
        } else {
          happyDiscount = await applyHappyTicket(tx, { ...body, ticketId, userId: current.userId }, now);
          await tx.happyRedemption.create({ data: { ticketId, bookingId, activeBookingId: bookingId, activeTicketId: ticketId, discount: happyDiscount } });
        }
      }
      const controllerCharge = controllers * Number(controller?.value ?? 0) * body.duration;
      const totalPrice = mode === 'HOUR_PASS' ? Math.round(controllerCharge) : Math.round((station.hourlyRate * body.duration + controllerCharge) * (1 - discount / 100) - happyDiscount);
      if (current.paymentStatus === 'PAID' && totalPrice !== current.totalPrice) throw new RewardError('PAID_PRICE_CHANGE', 'A paid booking cannot be repriced.', 409);
      for (const update of calculateHourPassUsageUpdates({ currentPass: current.passHoursDeducted > 0 ? current.userPass : null, currentPassHours: current.passHoursDeducted, selectedPass, selectedHours: selectedPass ? body.duration : 0, now })) {
        await tx.userPass.update({ where: { id: update.id }, data: { usedHours: update.usedHours, status: update.status } });
      }
      updated = await tx.booking.update({ where: { id: bookingId }, data: {
        ...metadata, updatedAt, stationId: body.stationId, date: body.date, startTime: body.startTime, endTime, duration: body.duration,
        extraControllers: controllers, controllerCharge, happyDiscount, discount, totalPrice, appliedBenefitType,
        userPassId: selectedPass?.id ?? null, passHoursDeducted: selectedPass ? body.duration : 0,
      }, include: happyBookingInclude });
    }
    const financialFields = ['stationId', 'date', 'startTime', 'endTime', 'duration', 'extraControllers', 'controllerCharge', 'discount', 'happyDiscount', 'totalPrice', 'userPassId', 'passHoursDeducted', 'appliedBenefitType'] as const;
    const changed = financialFields.filter(field => current[field] !== updated[field]);
    const metadataChanged = (['notes', 'customerName', 'customerPhone'] as const).filter(field => current[field] !== updated[field]);
    await audit(tx, actorId, 'ADMIN_BOOKING_EDIT', bookingId,
      Object.fromEntries(changed.map(field => [field, current[field]])),
      { ...Object.fromEntries(changed.map(field => [field, updated[field]])), metadataChanged });
    if (requestId) await saveReceipt(tx, actorId, 'ADMIN_BOOKING_EDIT', requestId, payload, { booking: updated });
    return updated;
  });
}
