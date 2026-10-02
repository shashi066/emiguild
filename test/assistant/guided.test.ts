import assert from 'node:assert/strict';
import test from 'node:test';
import { changeSelection, guidedStateSchema, guidedWindow, timeLabel } from '../../lib/assistant/flow-state';
import { intentToState, HANDOFF_TOOL } from '../../lib/assistant/intent';
import { canCancelOwnBooking, customerScopedAdmin } from '../../lib/assistant/customer-scope';
import { AssistantEventParser } from '../../lib/assistant/stream';
import { getGuidedView } from '../../lib/assistant/guided';
import { canUseAssistant } from '../../lib/assistant/access';
import { prisma } from '../../lib/prisma';
import { addIndiaCalendarDays, getIndiaClock } from '../../lib/public-booking-time';
import type { GuidedState } from '../../types/assistant';

function stub(t: { after: (fn: () => void) => void }, object: any, key: string, implementation: (...args: any[]) => any) {
  const original = object[key];
  object[key] = implementation;
  t.after(() => { object[key] = original; });
}

const intent = { task: 'BOOK', stationQuery: null, date: null, startTime: null, duration: null, extraControllers: null, notes: null, quantity: null, afterTime: null };
const user = { user: { id: 'self' }, requestUrl: 'http://localhost:3000', cookieHeader: '' };
const tomorrow = addIndiaCalendarDays(getIndiaClock().date, 1)!;
const station = { id: 'ps1', name: 'PS1', hourlyRate: 100, minDuration: 0.5, hasControllers: true };

test('changing an upstream selection invalidates its dependent values and benefits', () => {
  const state: GuidedState = { task: 'BOOK', stationId: 'ps1', date: tomorrow, startTime: '18:00', duration: 1, extraControllers: 2, notes: 'FC', gameChosen: true, benefitMode: 'GUILD', appliedBenefitType: 'HERO', queue: ['ps2'] };
  assert.deepEqual(changeSelection(state, 'duration'), { task: 'BOOK', stationId: 'ps1', date: tomorrow, startTime: '18:00' });
  assert.equal(state.benefitMode, 'GUILD', 'must not mutate navigation history');
  assert.deepEqual(changeSelection(state, 'stationId'), { task: 'BOOK' });
});
test('guided state rejects injected identity, mutation fields and invalid values', () => {
  for (const patch of [{ userId: 'other' }, { role: 'ADMIN' }, { token: 'bad' }, { duration: 0.75 }, { extraControllers: 4 }, { notes: 'x'.repeat(161) }]) {
    assert.equal(guidedStateSchema.safeParse({ task: 'BOOK', ...patch }).success, false);
  }
});
test('typed follow-ups preserve known details but require explicit benefit selection', () => {
  const previous: GuidedState = { task: 'BOOK', stationId: 'ps1', date: tomorrow, startTime: '18:00', duration: 1, extraControllers: 0, benefitMode: 'HOUR_PASS', hourPassId: 'pass' };
  const next = intentToState({ ...intent, duration: 2 }, previous)!;
  assert.equal(next.stationId, 'ps1'); assert.equal(next.date, tomorrow); assert.equal(next.startTime, '18:00');
  assert.equal(next.duration, 2); assert.equal(next.extraControllers, undefined); assert.equal(next.hourPassId, undefined);
});
test('interpretation can only hand off; unsupported and multi-station requests are bounded', () => {
  assert.equal(intentToState({ ...intent, task: 'UNSUPPORTED' }), null);
  assert.equal(intentToState({ ...intent, quantity: 2, startTime: '20:00' })?.task, 'NEXT');
  assert.equal(HANDOFF_TOOL.strict, true);
  assert.deepEqual([...HANDOFF_TOOL.parameters.required].sort(), Object.keys(HANDOFF_TOOL.parameters.properties).sort());
});
test('admin assistant requests only remove privileges and enforce ownership and cutoff', () => {
  assert.equal(customerScopedAdmin('ADMIN', new Headers({ 'x-emiguild-customer-scope': '1' })), false);
  assert.equal(customerScopedAdmin('USER', new Headers()), false);
  assert.equal(customerScopedAdmin('ADMIN', new Headers()), true);
  const booking = { userId: 'self', date: '2026-10-03', startTime: '18:00', status: 'CONFIRMED' };
  assert.equal(canCancelOwnBooking(booking, 'self', new Date('2026-10-03T12:29:00Z')), true);
  assert.equal(canCancelOwnBooking(booking, 'other', new Date('2026-10-03T12:29:00Z')), false);
  assert.equal(canCancelOwnBooking(booking, 'self', new Date('2026-10-03T12:31:00Z')), false);
  assert.equal(canCancelOwnBooking({ ...booking, status: 'CANCELLED' }, 'self'), false);
});
test('guided throttle resets at the minute boundary independently of AI allowance', () => {
  assert.equal(guidedWindow({ guidedWindowStart: 10, guidedWindowCount: 60 }, 659_999, 60).allowed, false);
  assert.deepEqual(guidedWindow({ guidedWindowStart: 10, guidedWindowCount: 60 }, 660_000, 60), { allowed: true, guidedWindowStart: 11, guidedWindowCount: 1 });
});
test('SSE parser handles fragmented and CRLF frames without duplicate events', () => {
  const parser = new AssistantEventParser();
  assert.deepEqual(parser.push('event: flow\r\ndata: {"type":"flow",'), []);
  assert.deepEqual(parser.push('"state":{"task":"BOOK"}}\r\n\r\n'), [{ type: 'flow', state: { task: 'BOOK' } }]);
  assert.deepEqual(parser.push('event: done\ndata: {"type":"done"}\n\n'), [{ type: 'done' }]);
  assert.deepEqual(parser.push(''), []);
  assert.equal(timeLabel('20:30'), '8:30 PM'); assert.equal(timeLabel('00:00'), '12:00 AM');
});
test('release modes apply equally to admins and customers', async (t) => {
  let mode = 'OFF';
  stub(t, prisma.setting, 'findMany', async () => [{ key: 'assistant_release_mode', value: mode }, { key: 'assistant_beta_user_emails', value: 'admin@example.test' }]);
  const admin = { role: 'ADMIN', email: 'admin@example.test' };
  assert.equal(await canUseAssistant(admin), false);
  mode = 'BETA'; assert.equal(await canUseAssistant(admin), true); assert.equal(await canUseAssistant(null), false);
  assert.equal(await canUseAssistant({ role: 'ADMIN', email: 'unlisted@example.test' }), false);
  mode = 'ON'; assert.equal(await canUseAssistant(admin), true); assert.equal(await canUseAssistant(null), true);
});
test('button booking reaches a signed quote without AI, writes, or benefit auto-selection', async (t) => {
  process.env.ASSISTANT_ACTION_SECRET = 'test-guided-secret';
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Guided booking must not call an AI or HTTP service'); });
  stub(t, prisma.station, 'findMany', async () => [station]);
  stub(t, prisma.station, 'findFirst', async () => station);
  stub(t, prisma.setting, 'findMany', async () => []);
  stub(t, prisma.setting, 'findUnique', async (args: any) => ({ value: args.where.key === 'venue_capacity' ? '2' : '25' }));
  stub(t, prisma.booking, 'findMany', async () => []);
  stub(t, prisma.booking, 'create', async () => { throw new Error('Preparation must never write'); });
  stub(t, prisma.userPass, 'findMany', async () => []);
  stub(t, prisma.user, 'findUnique', async () => ({ id: 'self', passes: [] }));
  let v = await getGuidedView({ task: 'BOOK' }, user);
  assert.equal(v.title, 'Choose a station');
  v = await getGuidedView(v.options[0].state, user);
  assert.equal(v.title, 'Choose a date');
  v = await getGuidedView(v.options.find((o) => o.state.date === tomorrow)!.state, user);
  assert.equal(v.title, 'Choose a time');
  v = await getGuidedView(v.options.find((o) => o.state.startTime === '18:00')!.state, user);
  assert.equal(v.title, 'Choose duration');
  v = await getGuidedView(v.options.find((o) => o.state.duration === 1)!.state, user);
  assert.equal(v.title, 'How many controllers?');
  stub(t, prisma.game, 'findMany', async () => [{ id: 'fc', name: 'FC', category: 'Sports' }]);
  v = await getGuidedView(v.options[1].state, user);
  assert.equal(v.title, 'Game request (optional)');
  v = await getGuidedView(v.options[1].state, user);
  assert.equal(v.title, 'Choose a benefit'); assert.equal(v.card, undefined);
  const guest = await getGuidedView(v.state, { ...user, user: null }); assert.equal(guest.login, true);
  v = await getGuidedView(v.options[0].state, user);
  assert.ok(v.card?.actionToken);
  assert.equal((v.card?.data?.quote as any).totalPrice, 125);
  assert.equal((v.card?.data?.quote as any).notes, 'FC');
});
test('next availability defaults to one hour and rechecks capacity after each station', async (t) => {
  let occupied: any[] = [];
  stub(t, prisma.station, 'findMany', async () => [station, { ...station, id: 'ps2', name: 'PS2' }]);
  stub(t, prisma.setting, 'findMany', async () => []);
  stub(t, prisma.setting, 'findUnique', async () => ({ value: '2' }));
  stub(t, prisma.booking, 'findMany', async () => occupied);
  const v = await getGuidedView({ task: 'NEXT', date: tomorrow, afterTime: '18:00', quantity: 2, search: true, extraControllers: 1, notes: 'FC', gameChosen: true }, user);
  assert.equal(v.options[0].state.duration, 1);
  assert.deepEqual(v.options[0].state.queue, ['ps2']);
  assert.equal(v.options[0].state.extraControllers, 1);
  assert.equal(v.options[0].state.notes, 'FC');
  assert.equal(v.options[0].state.gameChosen, true);
  assert.equal(v.card, undefined);
  occupied = [{ stationId: 'other', startTime: '16:00', endTime: '23:00' }];
  const noGroup = await getGuidedView({ task: 'NEXT', date: addIndiaCalendarDays(getIndiaClock().date, 30)!, quantity: 2, afterTime: '18:00', search: true }, user);
  assert.equal(noGroup.title, 'No matching slots found');
});
