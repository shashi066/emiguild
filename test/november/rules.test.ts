import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { bankedExpiry, DEFAULT_HAPPY_CONFIG, happyBookingProblem, happyExpiry, hasHappyWindow } from '../../lib/happy-ticket-rules';
import { validBookingPayment } from '../../lib/payment-verification';
import { selectWeighted } from '../../lib/spin-rewards';
import { calculateLegendaryProgress, getEffectiveSpinDate } from '../../lib/daily-spin';

test('Legendary progress resets after a missed spin day, using the configured IST reset hour', () => {
  assert.equal(calculateLegendaryProgress(23, '2026-10-29', '2026-10-29'), 23);
  assert.equal(calculateLegendaryProgress(23, '2026-10-28', '2026-10-29'), 23);
  assert.equal(calculateLegendaryProgress(23, '2026-10-27', '2026-10-29'), 0);
  assert.equal(calculateLegendaryProgress(23, null, '2026-10-29'), 0);
  assert.equal(calculateLegendaryProgress(29, '2026-12-31', '2027-01-01'), 29);
  assert.equal(calculateLegendaryProgress(29, '2026-12-30', '2027-01-01'), 0);
  const before = getEffectiveSpinDate(6, new Date('2026-10-29T05:59:59+05:30')).spinDate;
  const after = getEffectiveSpinDate(6, new Date('2026-10-29T06:00:00+05:30')).spinDate;
  assert.equal(calculateLegendaryProgress(23, '2026-10-27', before), 23);
  assert.equal(calculateLegendaryProgress(23, '2026-10-27', after), 0);
});

test('ticket expiry is the exclusive IST midnight ending the claim day', () => {
  for (const time of ['2026-11-03T00:00:00+05:30', '2026-11-03T23:59:59.999+05:30']) assert.equal(happyExpiry(new Date(time)).toISOString(), '2026-11-03T18:30:00.000Z');
  assert.equal(happyExpiry(new Date('2026-12-31T23:00:00+05:30')).toISOString(), '2026-12-31T18:30:00.000Z');
});
test('banked expiry clamps calendar months in IST, preserving local time', () => {
  assert.equal(bankedExpiry(new Date('2026-01-31T18:45:00+05:30')).toISOString(), '2026-02-28T13:15:00.000Z');
  assert.equal(bankedExpiry(new Date('2028-01-31T18:45:00+05:30')).toISOString(), '2028-02-29T13:15:00.000Z');
  assert.equal(bankedExpiry(new Date('2026-12-31T23:59:59+05:30')).toISOString(), '2027-01-31T18:29:59.000Z');
});
test('weekday warning and one-hour schedule validation do not change expiry', () => {
  const config = { ...DEFAULT_HAPPY_CONFIG, stationIds: ['ps5'] };
  assert.equal(hasHappyWindow(config, new Date('2026-11-07T10:00:00+05:30')), false);
  assert.equal(hasHappyWindow(config, new Date('2026-11-08T10:00:00+05:30')), false);
  assert.equal(hasHappyWindow(config, new Date('2026-11-09T22:00:00+05:30')), true);
  assert.equal(hasHappyWindow(config, new Date('2026-11-09T22:00:01+05:30')), false);
  assert.equal(hasHappyWindow(config, new Date('2026-11-09T23:59:00+05:30')), false);
  const input = { config, stationId: 'ps5', hasControllers: true, date: '2026-11-04', startTime: '16:00', duration: 2, now: new Date('2026-11-03T10:00:00+05:30'), expiresAt: new Date('2026-11-05T00:00:00+05:30') };
  assert.equal(happyBookingProblem(input), null);
  assert.match(happyBookingProblem({ ...input, expiresAt: happyExpiry(input.now) })!, /full session/);
  assert.match(happyBookingProblem({ ...input, date: '2026-11-03', expiresAt: happyExpiry(input.now) }) ?? '', /^$/);
  assert.match(happyBookingProblem({ ...input, duration: .5 })!, /one-hour/);
  assert.match(happyBookingProblem({ ...input, startTime: '22:30' })!, /first gaming hour/);
  assert.match(happyBookingProblem({ ...input, expiresAt: new Date('2026-11-04T17:00:00+05:30') })!, /full session/);
  assert.match(happyBookingProblem({ ...input, stationId: 'simulator' })!, /eligible PS5/);
  assert.match(happyBookingProblem({ ...input, now: input.expiresAt })!, /expired/);
});
test('weighted selection covers every boundary and rejects invalid pools', () => {
  const pool = [{ id: 'a', weight: 60 }, { id: 'b', weight: 30 }, { id: 'c', weight: 10 }];
  for (let roll = 0; roll < 100; roll++) assert.equal(selectWeighted(pool, () => roll).id, roll < 60 ? 'a' : roll < 90 ? 'b' : 'c');
  assert.throws(() => selectWeighted([])); assert.throws(() => selectWeighted([{ weight: -1 }]));
});
test('a valid signature for another booking order cannot confirm this booking', () => {
  const secret = 'test-only-secret'; const orderId = 'order_a'; const paymentId = 'pay_a';
  const signature = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const input = { secret, orderId, paymentId, signature, storedOrderId: orderId };
  assert.equal(validBookingPayment(input), true);
  assert.equal(validBookingPayment({ ...input, storedOrderId: 'order_b' }), false);
  assert.equal(validBookingPayment({ ...input, storedOrderId: null }), false);
  assert.equal(validBookingPayment({ ...input, signature: '0'.repeat(64) }), false);
});
