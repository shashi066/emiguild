import assert from 'node:assert/strict';
import test from 'node:test';
import { publicHelpRequest } from '../../lib/assistant/chat';
import { createActionToken, quoteFingerprint, verifyActionToken } from '../../lib/assistant/tokens';
import { assistantActor } from '../../lib/assistant/usage';
import { getVenueRemainingCapacity } from '../../lib/booking-availability';
import type { BookingDraft } from '../../types/assistant';

process.env.AUTH_SECRET = 'assistant-test-secret-with-enough-entropy';

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

test('AI receives only approved knowledge and bounded chat, with no tools or private identity', () => {
  const request = publicHelpRequest('Where is EmiGuild?', [{ role: 'user', content: 'Hi' }], { venue: 'EmiGuild' }, 'test-model');
  assert.equal('tools' in request, false);
  assert.equal(request.store, false);
  assert.equal(request.max_output_tokens, 600);
  assert.deepEqual(JSON.parse(request.input[0].content), { history: [{ role: 'user', content: 'Hi' }], request: 'Where is EmiGuild?' });
  assert.ok(request.instructions.includes('EmiGuild'));
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

test('confirmation tokens work without a separate assistant secret and follow AUTH_SECRET rotation', () => {
  const previousAuthSecret = process.env.AUTH_SECRET;
  try {
    process.env.AUTH_SECRET = 'test-auth-secret';
    const token = createActionToken({ action: 'DAILY_SPIN', userId: 'user-1', spinDate: '2026-10-02' });
    assert.equal(verifyActionToken(token).userId, 'user-1');
    const [encoded, signature] = token.split('.');
    assert.throws(() => verifyActionToken(`${encoded.slice(0, -1)}x.${signature}`), /Invalid confirmation token/);
    process.env.AUTH_SECRET = 'rotated-test-auth-secret';
    assert.throws(() => verifyActionToken(token), /Invalid confirmation token/);
    delete process.env.AUTH_SECRET;
    assert.throws(() => createActionToken({ action: 'DAILY_SPIN', userId: 'user-1', spinDate: '2026-10-02' }), /AUTH_SECRET is not configured/);
  } finally {
    if (previousAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousAuthSecret;
  }
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
