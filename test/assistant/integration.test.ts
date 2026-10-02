import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { addIndiaCalendarDays, getIndiaClock } from '../../lib/public-booking-time';
import { createActionToken, verifyActionToken } from '../../lib/assistant/tokens';
import { getEffectiveSpinDate } from '../../lib/daily-spin';
import type { GuidedState } from '../../types/assistant';

const base = process.env.ASSISTANT_TEST_URL;
test('assistant HTTP flows against a disposable database', { skip: !base }, async (t) => {
  assert.match(process.env.DATABASE_URL ?? '', /^file:.*assistant-test/);
  await prisma.user.deleteMany({ where: { email: { in: ['assistant-admin@example.test', 'assistant-customer@example.test'] } } });
  await prisma.station.deleteMany({ where: { name: { in: ['Test PS1', 'Test PS2'] } } });
  await prisma.game.deleteMany({ where: { name: 'Test FC' } });
  await prisma.lootItem.deleteMany({ where: { name: 'Test reward' } });
  await prisma.setting.deleteMany({ where: { key: 'assistant_beta_user_emails' } });
  const password = 'assistant-test-only';
  const hash = await bcrypt.hash(password, 4);
  const admin = await prisma.user.create({ data: { name: 'Assistant Test Admin', email: 'assistant-admin@example.test', password: hash, role: 'ADMIN', phone: '9999999999' } });
  const other = await prisma.user.create({ data: { name: 'Assistant Test Customer', email: 'assistant-customer@example.test', password: hash, phone: '9999999998' } });
  const station = await prisma.station.create({ data: { name: 'Test PS1', description: 'Test station', specs: 'PS5', hourlyRate: 100, minDuration: 0.5 } });
  const second = await prisma.station.create({ data: { name: 'Test PS2', description: 'Test station', specs: 'PS5', hourlyRate: 100, minDuration: 0.5 } });
  await prisma.game.create({ data: { name: 'Test FC', category: 'Sports' } });
  await prisma.lootItem.create({ data: { name: 'Test reward', weight: 1 } });
  for (const [key, value] of Object.entries({ assistant_release_mode: 'ON', controller_price: '25', venue_capacity: '2', daily_spin_enabled: 'true' })) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  let date = addIndiaCalendarDays(getIndiaClock().date, 1)!;
  while ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) date = addIndiaCalendarDays(date, 1)!;
  const nextDate = addIndiaCalendarDays(date, 1)!;
  const pass = await prisma.userPass.create({ data: { userId: admin.id, passType: 'BRONZE', totalHours: 10, price: 1000, expiresAt: new Date(Date.now() + 40 * 86400000) } });
  await prisma.userPass.create({ data: { userId: admin.id, passType: 'GUILD_MASTER', totalHours: 0, price: 1000, expiresAt: new Date(Date.now() + 40 * 86400000) } });
  const login = async (email: string) => {
    const csrf = await fetch(`${base}/api/auth/csrf`);
    let cookies = csrf.headers.getSetCookie().map((v) => v.split(';')[0]);
    const { csrfToken } = await csrf.json();
    const response = await fetch(`${base}/api/auth/callback/credentials`, { method: 'POST', redirect: 'manual', headers: {
      'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies.join('; '), 'X-Auth-Return-Redirect': '1',
    }, body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${base}/` }) });
    cookies = [...cookies, ...response.headers.getSetCookie().map((v) => v.split(';')[0])];
    assert.ok(cookies.some((v) => v.startsWith('authjs.session-token=')));
    return cookies.join('; ');
  };
  const adminCookie = await login(admin.email), otherCookie = await login(other.email);
  const api = async (path: string, body: unknown, cookie = adminCookie, origin = base!) => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin }, body: JSON.stringify(body) });
    return { response, data: await response.json() };
  };
  const guide = (state: GuidedState, cookie = adminCookie) => api('/api/assistant/guided', state, cookie);
  const act = (token: string, cookie = adminCookie) => api('/api/assistant/actions', { token }, cookie);
  const draft: GuidedState = { task: 'BOOK', stationId: station.id, date, startTime: '18:00', duration: 1, extraControllers: 1, notes: 'Test FC', gameChosen: true };
  let bookingId = '';

  await t.test('guests can browse and retain normalized intent at sign-in', async () => {
    const result = await guide(draft, '');
    assert.equal(result.response.status, 200); assert.equal(result.data.login, true);
    assert.equal(result.data.state.stationId, station.id); assert.equal(result.data.state.notes, 'Test FC');
    assert.equal((await guide({ task: 'PRICES' }, '')).response.status, 200);
  });
  await t.test('admin guided booking requires explicit benefit selection and confirmation', async () => {
    const options = await guide(draft);
    assert.equal(options.data.title, 'Choose a benefit'); assert.equal(options.data.card, undefined);
    const option = options.data.options.find((o: any) => o.state.benefitMode === 'HOUR_PASS');
    assert.equal(option.state.hourPassId, pass.id);
    const prepared = await guide(option.state);
    assert.equal(prepared.data.card.data.quote.totalPrice, 25);
    assert.equal(await prisma.booking.count({ where: { userId: admin.id } }), 0);
    const result = await act(prepared.data.card.actionToken);
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    bookingId = result.data.card.data.booking.id;
    assert.equal((await prisma.userPass.findUniqueOrThrow({ where: { id: pass.id } })).usedHours, 1);
    assert.equal((await act(prepared.data.card.actionToken)).response.status, 409);
    assert.equal(await prisma.booking.count({ where: { userId: admin.id } }), 1);
  });
  await t.test('admin cancellation restores hours once and cannot access another account', async () => {
    const prepared = await guide({ task: 'BOOKINGS', bookingId, cancel: true });
    assert.equal((await act(prepared.data.card.actionToken, otherCookie)).response.status, 403);
    assert.equal((await act(prepared.data.card.actionToken)).response.status, 200);
    assert.equal((await act(prepared.data.card.actionToken)).response.status, 409);
    assert.equal((await prisma.userPass.findUniqueOrThrow({ where: { id: pass.id } })).usedHours, 0);
    const foreign = await prisma.booking.create({ data: { userId: other.id, stationId: second.id, date, startTime: '20:00', endTime: '21:00', duration: 1, totalPrice: 100, status: 'CONFIRMED' } });
    assert.equal((await guide({ task: 'BOOKINGS', bookingId: foreign.id, cancel: true })).response.status, 400);
    const forged = createActionToken({ action: 'CANCELLATION', userId: admin.id, bookingId: foreign.id });
    assert.equal((await act(forged)).response.status, 409);
    const listed = await guide({ task: 'BOOKINGS' });
    assert.ok(!JSON.stringify(listed.data).includes(foreign.id));
  });
  await t.test('stale prices demand a refreshed confirmation; standard and Guild stay pay-at-venue', async () => {
    const prepared = await guide({ ...draft, benefitMode: 'GUILD', appliedBenefitType: 'GUILD_MASTER' });
    const oldToken = prepared.data.card.actionToken;
    await prisma.station.update({ where: { id: station.id }, data: { hourlyRate: 120 } });
    const stale = await act(oldToken);
    assert.equal(stale.response.status, 409); assert.equal(stale.data.code, 'QUOTE_STALE');
    assert.equal(stale.data.card.data.quote.totalPrice, 73);
    const result = await act(stale.data.card.actionToken);
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.card.data.booking.paymentStatus, 'UNPAID');
    const standard = await guide({ ...draft, date: nextDate, benefitMode: 'STANDARD' });
    const standardResult = await act(standard.data.card.actionToken);
    assert.equal(standardResult.response.status, 200, JSON.stringify(standardResult.data));
    assert.equal(standardResult.data.card.data.booking.totalPrice, 145);
  });
  await t.test('multi-station continuation reports a fresh conflict without undoing the first booking', async () => {
    const collision = await prisma.booking.create({ data: { userId: other.id, stationId: second.id, date: nextDate, startTime: '18:00', endTime: '19:00', duration: 1, totalPrice: 100, status: 'CONFIRMED' } });
    const result = await guide({ ...draft, stationId: second.id, date: nextDate, completed: [station.id] });
    assert.equal(result.response.status, 400);
    assert.match(result.data.error, /no longer available/);
    assert.equal(await prisma.booking.count({ where: { userId: admin.id, date: nextDate, status: 'CONFIRMED' } }), 1);
    assert.ok(collision.id);
  });
  await t.test('spin confirmation uses server reward, rejects repeat and reset-day replay', async () => {
    const prepared = await guide({ task: 'SPIN' });
    const token = prepared.data.card.actionToken;
    assert.equal(verifyActionToken(token).action, 'DAILY_SPIN');
    assert.equal((await act(token)).response.status, 200);
    assert.equal((await act(token)).response.status, 409);
    assert.equal(await prisma.userDailySpin.count({ where: { userId: admin.id } }), 1);
    const expiredDay = createActionToken({ action: 'DAILY_SPIN', userId: other.id, spinDate: addIndiaCalendarDays(getEffectiveSpinDate().spinDate, -1)! });
    assert.equal((await act(expiredDay, otherCookie)).response.status, 409);
  });
  await t.test('origin, expired tokens, and tampered tokens are rejected', async () => {
    const token = createActionToken({ action: 'CANCELLATION', userId: admin.id, bookingId }, -1);
    assert.equal((await act(token)).response.status, 400);
    assert.equal((await act(`${token}x`)).response.status, 400);
    assert.equal((await api('/api/assistant/actions', { token }, adminCookie, 'https://other.test')).response.status, 403);
    assert.equal((await api('/api/assistant/guided', { task: 'PRICES' }, adminCookie, 'https://other.test')).response.status, 403);
  });
  await t.test('AI exhaustion does not consume or disable guided allowance', async () => {
    const today = getIndiaClock().date;
    await prisma.assistantUsageDaily.update({ where: { date_actorKey: { date: today, actorKey: `user:${admin.id}` } }, data: { requestCount: 100 } });
    assert.equal((await api('/api/assistant/chat', { message: 'hello' })).response.status, 429);
    assert.equal((await guide({ task: 'PRICES' })).response.status, 200);
    await prisma.assistantUsageDaily.update({ where: { date_actorKey: { date: today, actorKey: `user:${admin.id}` } }, data: { guidedWindowStart: Math.floor(Date.now() / 60000), guidedWindowCount: 60 } });
    assert.equal((await guide({ task: 'PRICES' })).response.status, 429);
    await prisma.assistantUsageDaily.update({ where: { date_actorKey: { date: today, actorKey: `user:${admin.id}` } }, data: { guidedWindowCount: 0 } });
  });
  await t.test('release OFF and BETA include admins in the same restrictions', async () => {
    await prisma.setting.update({ where: { key: 'assistant_release_mode' }, data: { value: 'OFF' } });
    assert.equal((await guide({ task: 'PRICES' })).response.status, 403);
    await prisma.setting.update({ where: { key: 'assistant_release_mode' }, data: { value: 'BETA' } });
    assert.equal((await guide({ task: 'PRICES' })).response.status, 403);
    await prisma.setting.upsert({ where: { key: 'assistant_beta_user_emails' }, create: { key: 'assistant_beta_user_emails', value: admin.email }, update: { value: admin.email } });
    assert.equal((await guide({ task: 'PRICES' })).response.status, 200);
    assert.equal((await guide({ task: 'PRICES' }, '')).response.status, 403);
    await prisma.setting.update({ where: { key: 'assistant_release_mode' }, data: { value: 'ON' } });
  });
  await prisma.$disconnect();
});
