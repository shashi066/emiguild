import assert from 'node:assert/strict';
import test from 'node:test';
import { ASSISTANT_TOOLS } from '../../lib/assistant/tools';
import { createActionToken, quoteFingerprint, verifyActionToken } from '../../lib/assistant/tokens';
import { assistantActor } from '../../lib/assistant/usage';
import { getVenueRemainingCapacity } from '../../lib/booking-availability';
import type { BookingDraft } from '../../types/assistant';

process.env.ASSISTANT_ACTION_SECRET = 'assistant-test-secret-with-enough-entropy';

const draft: BookingDraft = {
  stationId: 'station-1',
  date: '2026-10-02',
  startTime: '18:00',
  duration: 1,
  extraControllers: 0,
  notes: 'EA Sports FC 26',
  benefitMode: 'STANDARD',
  hourPassId: null,
  appliedBenefitType: null,
};

test('assistant exposes only the approved read and prepare tool surface', () => {
  assert.deepEqual(
    ASSISTANT_TOOLS.map((tool) => tool.name),
    [
      'get_stations_and_prices', 'get_availability', 'get_games',
      'get_my_bookings', 'get_booking_options', 'get_daily_spin_status',
      'prepare_booking', 'prepare_cancellation', 'prepare_daily_spin',
    ],
  );
  for (const tool of ASSISTANT_TOOLS) {
    assert.equal(tool.strict, true);
    assert.equal(tool.parameters.additionalProperties, false);
    assert.deepEqual(
      [...tool.parameters.required].sort(),
      Object.keys(tool.parameters.properties).sort(),
      `${tool.name} must require every strict-schema property`,
    );
  }
  assert.equal(ASSISTANT_TOOLS.some((tool) => /revenue|admin|customer|sql|create_booking|cancel_booking/.test(tool.name)), false);
});

test('booking confirmation tokens bind exact data and reject tampering', () => {
  const quoteHash = quoteFingerprint({ ...draft, totalPrice: 150 });
  const token = createActionToken({ action: 'BOOKING', userId: 'user-1', draft, quoteHash });
  const payload = verifyActionToken(token);
  assert.equal(payload.action, 'BOOKING');
  assert.equal(payload.userId, 'user-1');
  if (payload.action === 'BOOKING') {
    assert.deepEqual(payload.draft, draft);
    assert.equal(payload.quoteHash, quoteHash);
  }

  const [encoded, signature] = token.split('.');
  assert.throws(() => verifyActionToken(`${encoded.slice(0, -1)}x.${signature}`), /Invalid confirmation token/);
});

test('expired confirmation tokens are rejected', () => {
  const token = createActionToken({ action: 'DAILY_SPIN', userId: 'user-1', spinDate: '2026-10-02' }, -1);
  assert.throws(() => verifyActionToken(token), /expired/);
});

test('anonymous rate-limit actor keys are pseudonymous', () => {
  const visitorId = 'raw-browser-visitor-id';
  const actor = assistantActor(null, visitorId);
  assert.match(actor.actorKey, /^anon:[a-f0-9]{64}$/);
  assert.equal(actor.actorKey.includes(visitorId), false);
  assert.equal(assistantActor('user-1', visitorId).actorKey, 'user:user-1');
});

test('multi-station availability respects venue capacity across the full interval', () => {
  const requested = { startTime: '18:00', endTime: '20:00' };
  assert.equal(getVenueRemainingCapacity(requested, [
    { startTime: '17:00', endTime: '19:00' },
    { startTime: '19:00', endTime: '21:00' },
  ], 2), 1, 'back-to-back existing bookings occupy only one concurrent place');
  assert.equal(getVenueRemainingCapacity(requested, [
    { startTime: '17:00', endTime: '20:00' },
    { startTime: '18:30', endTime: '19:30' },
  ], 2), 0, 'peak occupancy controls remaining group capacity');
});
