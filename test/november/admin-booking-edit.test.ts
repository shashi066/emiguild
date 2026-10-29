import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../../lib/prisma';
import { editHappyBooking, restoreHappyTicket, happyPoolState } from '../../lib/happy-tickets';
import { rewardTransaction } from '../../lib/november';

const url = process.env.DATABASE_URL ?? '';
if (url !== process.env.NOVEMBER_TEST_DATABASE_URL || !(url.includes('november-test') || /\/emiguild_november_[a-z0-9_]+(?:\?|$)/.test(url))) throw new Error('Use the disposable November database.');
after(() => prisma.$disconnect());
const now = new Date('2026-11-02T10:00:00+05:30');

async function fixture() {
  const suffix = randomUUID();
  const admin = await prisma.user.create({ data: { name: 'Edit admin', email: `edit-admin-${suffix}@example.test`, password: 'test', role: 'ADMIN' } });
  const owner = await prisma.user.create({ data: { name: 'Edit customer', email: `edit-${suffix}@example.test`, password: 'test' } });
  const station = await prisma.station.create({ data: { name: 'Edit PS5', description: 'test', specs: 'test', hourlyRate: 150, minDuration: .5 } });
  const booking = await prisma.booking.create({ data: { userId: owner.id, stationId: station.id, date: '2026-11-03', startTime: '16:00', endTime: '18:00', duration: 2, totalPrice: 350, extraControllers: 1, controllerCharge: 50, status: 'CONFIRMED' } });
  for (const [key, value] of [['venue_capacity', '100'], ['controller_price', '25']]) await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  const issue = (userId = owner.id, expiresAt = new Date('2026-11-04T00:00:00+05:30')) => prisma.happyTicket.create({ data: { userId, expiresAt, rulesSnapshot: JSON.stringify({ stationIds: [station.id], days: [1,2,3,4,5], startTime: '16:00', endTime: '23:00' }) } });
  const input = async (changes: Record<string, unknown> = {}) => ({ stationId: station.id, date: booking.date, startTime: '16:00', duration: 2, extraControllers: 1, discount: 0, benefitMode: 'STANDARD', expectedUpdatedAt: (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).updatedAt.toISOString(), requestId: randomUUID(), ...changes });
  return { admin, owner, station, booking, issue, input };
}

test('admin apply/remove/replace/reapply preserve history, pricing, expiry and replay', async () => {
  const f = await fixture(); const first = await f.issue(); const second = await f.issue();
  const pool = await happyPoolState(now);
  const payload = await f.input({ benefitMode: 'HAPPY_TICKET', happyTicketId: first.id, notes: 'Audit metadata must not be duplicated.', customerName: 'Changed private name' });
  const applied = await editHappyBooking(f.admin.id, f.booking.id, payload, now);
  assert.equal(applied.totalPrice, 200); assert.equal(applied.happyDiscount, 150);
  const audit = await prisma.rewardAudit.findFirstOrThrow({ where: { action: 'ADMIN_BOOKING_EDIT', referenceId: f.booking.id } });
  const detail = JSON.parse(audit.after);
  assert.equal(audit.actorId, f.admin.id); assert.equal(detail.totalPrice, 200);
  assert.deepEqual(detail.metadataChanged, ['notes', 'customerName']);
  assert.ok(!audit.after.includes('Audit metadata must not be duplicated.'));
  assert.ok(!audit.after.includes('Changed private name'));
  assert.ok(!audit.after.includes('createdAt'));

  const replay = await editHappyBooking(f.admin.id, f.booking.id, payload, now);
  assert.equal(await prisma.rewardAudit.count({ where: { action: 'ADMIN_BOOKING_EDIT', referenceId: f.booking.id } }), 1);
  assert.equal(replay.id, applied.id); assert.equal(await prisma.happyRedemption.count({ where: { bookingId: applied.id } }), 1);
  await assert.rejects(() => editHappyBooking(f.admin.id, f.booking.id, { ...payload, duration: 3 }, now), /different action/);
  await assert.rejects(() => editHappyBooking(f.admin.id, f.booking.id, { ...payload, requestId: randomUUID() }, now), /changed/);
  await editHappyBooking(f.admin.id, f.booking.id, await f.input({ benefitMode: 'HAPPY_TICKET', happyTicketId: second.id }), now);
  assert.equal((await prisma.happyTicket.findUniqueOrThrow({ where: { id: first.id } })).status, 'CLAIMED');
  const removed = await editHappyBooking(f.admin.id, f.booking.id, await f.input(), now);
  assert.equal(removed.totalPrice, 350); assert.equal(removed.happyDiscount, 0);
  assert.equal((await prisma.happyTicket.findUniqueOrThrow({ where: { id: second.id } })).expiresAt.toISOString(), second.expiresAt.toISOString());
  await editHappyBooking(f.admin.id, f.booking.id, await f.input({ benefitMode: 'HAPPY_TICKET', happyTicketId: first.id }), now);
  await rewardTransaction(tx => restoreHappyTicket(tx, f.booking.id, now));
  await rewardTransaction(tx => restoreHappyTicket(tx, f.booking.id, now));
  const history = await prisma.happyRedemption.findMany({ where: { bookingId: f.booking.id } });
  assert.equal(history.length, 3); assert.ok(history.every(r => r.status === 'RESTORED' && !r.activeBookingId && !r.activeTicketId));
  assert.equal((await happyPoolState(now)).available, pool.available);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: f.owner.id } })).happyLastClaimedAt, null);
});

test('Happy edits restore pass hours; explicit replacement benefits remain exclusive', async () => {
  const f = await fixture(); const ticket = await f.issue();
  const pass = await prisma.userPass.create({ data: { userId: f.owner.id, passType: 'BRONZE', totalHours: 5, usedHours: 2, price: 500, expiresAt: new Date('2027-01-01') } });
  await prisma.booking.update({ where: { id: f.booking.id }, data: { userPassId: pass.id, passHoursDeducted: 2, totalPrice: 50 } });
  await editHappyBooking(f.admin.id, f.booking.id, await f.input({ benefitMode: 'HAPPY_TICKET', happyTicketId: ticket.id }), now);
  assert.equal((await prisma.userPass.findUniqueOrThrow({ where: { id: pass.id } })).usedHours, 0);
  await assert.rejects(async () => editHappyBooking(f.admin.id, f.booking.id, await f.input({ benefitMode: 'HAPPY_TICKET', happyTicketId: ticket.id, discount: 10 }), now), /one booking benefit/);
  const swapped = await editHappyBooking(f.admin.id, f.booking.id, await f.input({ benefitMode: 'HOUR_PASS', hourPassId: pass.id }), now);
  assert.equal(swapped.totalPrice, 50); assert.equal((await prisma.userPass.findUniqueOrThrow({ where: { id: pass.id } })).usedHours, 2);
  assert.equal((await prisma.happyTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, 'CLAIMED');
});

test('omitted benefit controls preserve pass and membership on metadata and session edits', async () => {
  const f = await fixture();
  const pass = await prisma.userPass.create({ data: { userId: f.owner.id, passType: 'BRONZE', totalHours: 5, usedHours: 2, price: 500, expiresAt: new Date('2027-01-01') } });
  await prisma.booking.update({ where: { id: f.booking.id }, data: { userPassId: pass.id, passHoursDeducted: 2, totalPrice: 50 } });
  const implicitInput = async (changes: Record<string, unknown> = {}) => {
    const body: Record<string, unknown> = await f.input(changes);
    delete body.benefitMode;
    delete body.discount;
    return body;
  };
  const metadata = await editHappyBooking(f.admin.id, f.booking.id, await implicitInput({ notes: 'Keep pass' }), now);
  assert.equal(metadata.userPassId, pass.id);
  assert.equal(metadata.totalPrice, 50);
  const moved = await editHappyBooking(f.admin.id, f.booking.id, await implicitInput({ startTime: '17:00' }), now);
  assert.equal(moved.passHoursDeducted, 2);
  assert.equal((await prisma.userPass.findUniqueOrThrow({ where: { id: pass.id } })).usedHours, 2);

  await prisma.userPass.create({ data: { userId: f.owner.id, passType: 'GUILD_MASTER', totalHours: 0, price: 999, purchasedAt: now, expiresAt: new Date('2027-01-01') } });
  await prisma.booking.update({ where: { id: f.booking.id }, data: { userPassId: null, passHoursDeducted: 0, appliedBenefitType: 'GUILD_MASTER', discount: 50, totalPrice: 175 } });
  const guild = await editHappyBooking(f.admin.id, f.booking.id, await implicitInput({ startTime: '18:00' }), now);
  assert.equal(guild.appliedBenefitType, 'GUILD_MASTER');
  assert.equal(guild.discount, 50);
  assert.equal(guild.totalPrice, 175);
});

test('Happy edits enforce role, ownership, expiry, schedule, status, payment and contention', async () => {
  const f = await fixture(); const ticket = await f.issue(); const foreign = await f.issue(f.admin.id);
  const edit = async (changes: Record<string, unknown> = {}, when = now) => editHappyBooking(f.admin.id, f.booking.id, await f.input({ benefitMode: 'HAPPY_TICKET', happyTicketId: ticket.id, ...changes }), when);
  await assert.rejects(async () => editHappyBooking(f.owner.id, f.booking.id, await f.input(), now), /Forbidden/);
  await assert.rejects(() => edit({ happyTicketId: foreign.id }), /unavailable/);
  const expired = await f.issue(f.owner.id, new Date('2026-11-01'));
  await assert.rejects(() => edit({ happyTicketId: expired.id }), /expired/);
  await assert.rejects(() => edit({ duration: .5 }), /one-hour/);
  await assert.rejects(() => edit({ date: '2026-11-07' }), /eligible/);
  await prisma.booking.update({ where: { id: f.booking.id }, data: { paymentStatus: 'PAID' } });
  await assert.rejects(() => edit(), /paid booking/);
  await prisma.booking.update({ where: { id: f.booking.id }, data: { paymentStatus: 'UNPAID' } });
  await assert.rejects(() => edit({}, new Date('2026-11-03T17:00:00+05:30')), /already started/);
  await prisma.booking.update({ where: { id: f.booking.id }, data: { status: 'CHECKED_IN' } });
  await assert.rejects(() => edit(), /pending or confirmed/);
  await prisma.booking.update({ where: { id: f.booking.id }, data: { status: 'CONFIRMED' } });
  const second = await prisma.booking.create({ data: { userId: f.owner.id, stationId: f.station.id, date: '2026-11-03', startTime: '19:00', endTime: '20:00', duration: 1, totalPrice: 150, status: 'CONFIRMED' } });
  const results = await Promise.allSettled([
    edit(), editHappyBooking(f.admin.id, second.id, { stationId: f.station.id, date: second.date, startTime: '19:00', duration: 1, benefitMode: 'HAPPY_TICKET', happyTicketId: ticket.id, expectedUpdatedAt: second.updatedAt.toISOString(), requestId: randomUUID() }, now),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await prisma.happyRedemption.count({ where: { ticketId: ticket.id, status: 'APPLIED' } }), 1);
  // Removal after a ticket's original expiry never extends it.
  const winning = await prisma.happyRedemption.findFirstOrThrow({ where: { ticketId: ticket.id, status: 'APPLIED' } });
  await rewardTransaction(tx => restoreHappyTicket(tx, winning.bookingId, new Date('2026-11-05')));
  assert.equal((await prisma.happyTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, 'EXPIRED');
});
