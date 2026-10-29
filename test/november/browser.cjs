const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const baseURL = process.env.NOVEMBER_BROWSER_URL || 'http://127.0.0.1:3006';
if (!process.env.DATABASE_URL?.includes('november-test')) throw new Error('Browser checks require the disposable November database.');
const prisma = new PrismaClient();
const password = 'November-fixture-only-123';
const now = new Date();
const dateKey = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const day = dateKey(new Date(now.getTime() + 86400000));
const output = mkdtempSync(path.join(tmpdir(), 'emiguild-november-browser-'));
async function member(role) {
  return prisma.user.create({ data: { name: `Browser ${role}`, email: `browser-${randomUUID()}@example.test`, password: await bcrypt.hash(password, 4), role, phone: '9999999999' } });
}
async function login(context, email) {
  const csrf = await (await context.request.get(`${baseURL}/api/auth/csrf`)).json();
  const response = await context.request.post(`${baseURL}/api/auth/callback/credentials`, { form: { csrfToken: csrf.csrfToken, email, password, callbackUrl: baseURL }, headers: { origin: baseURL } });
  assert.ok(response.status() < 400, `Login failed: ${response.status()}`);
  const session = await (await context.request.get(`${baseURL}/api/auth/session`)).json();
  assert.ok(session.user?.id, 'Authenticated session missing');
}
async function post(context, route, data, origin = baseURL) { return context.request.post(`${baseURL}${route}`, { data, headers: { origin } }); }
(async () => {
  const admin = await member('ADMIN'); const owner = await member('USER'); const outsider = await member('USER');
  const station = await prisma.station.create({ data: { name: 'Browser PS5', specs: 'PS5', description: 'Disposable browser fixture', hourlyRate: 150 } });
  await prisma.happyPool.upsert({ where: { id: 'main' }, create: { id: 'main' }, update: { available: 5, version: { increment: 1 } } });
  await prisma.lootItem.updateMany({ data: { enabled: false } });
  await prisma.lootItem.createMany({ data: [{ name: 'Browser Common', rarity: 'COMMON', weight: 100 }, { name: 'Browser Epic', rarity: 'EPIC', weight: 5 }, { name: 'Browser Legendary', rarity: 'LEGENDARY', weight: 1 }] });
  for (const [key, value] of Object.entries({ venue_capacity: '100', controller_price: '25', daily_spin_enabled: 'true', legendary_pity_30_enabled: 'true', happy_tickets_enabled: 'true' })) await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  const browser = await chromium.launch({ headless: true, ...(process.env.NOVEMBER_BROWSER_EXECUTABLE ? { executablePath: process.env.NOVEMBER_BROWSER_EXECUTABLE } : {}) });
  try {
    const anonymous = await browser.newContext({ baseURL });
    assert.equal((await anonymous.request.get('/api/admin/happy-tickets')).status(), 403);
    assert.equal((await post(anonymous, '/api/happy-tickets/claim', { requestId: randomUUID() })).status(), 401);
    const staff = await browser.newContext({ baseURL }); await login(staff, admin.email);
    const account = await browser.newContext({ baseURL }); await login(account, owner.email);
    const other = await browser.newContext({ baseURL }); await login(other, outsider.email);
    assert.equal((await other.request.get('/api/admin/happy-tickets')).status(), 403);
    const adminState = await (await staff.request.get('/api/admin/happy-tickets')).json();
    const configResponse = await post(staff, '/api/admin/happy-tickets', { kind: 'CONFIG', input: { config: { stationIds: [station.id], days: [1,2,3,4,5], startTime: '16:00', endTime: '23:00' }, version: adminState.pool.version } });
    assert.equal(configResponse.status(), 200, await configResponse.text());
    assert.equal((await post(account, '/api/happy-tickets/claim', { requestId: randomUUID() }, 'https://evil.example')).status(), 403);
    const requestId = randomUUID();
    const claim = await post(account, '/api/happy-tickets/claim', { requestId }); assert.equal(claim.status(), 200, await claim.text());
    const ticket = (await claim.json()).ticket;
    const claimReplay = await post(account, '/api/happy-tickets/claim', { requestId }); assert.equal((await claimReplay.json()).ticket.id, ticket.id);
    assert.equal((await other.request.get(`/api/rewards/receipts/HAPPY_CLAIM/${requestId}`)).status(), 404);
    const payload = { stationId: station.id, date: day, startTime: '16:00', duration: 2, extraControllers: 1, notes: '', benefitMode: 'HAPPY_TICKET', happyTicketId: ticket.id, requestId: randomUUID() };
    const booked = await post(account, '/api/bookings', payload); assert.equal(booked.status(), 201, await booked.text());
    const booking = (await booked.json()).booking;
    assert.equal(booking.totalPrice, 200); assert.equal(booking.happyDiscount, 150); assert.equal(booking.controllerCharge, 50);
    const replay = await post(account, '/api/bookings', payload); assert.equal((await replay.json()).booking.id, booking.id);
    assert.equal((await post(account, '/api/bookings', { ...payload, duration: 3 })).status(), 409);
    assert.equal((await post(other, '/api/bookings', { ...payload, requestId: randomUUID() })).status(), 409);
    const edited = await staff.request.put(`/api/bookings/${booking.id}`, { data: { ...payload, startTime: '17:00' }, headers: { origin: baseURL } });
    assert.equal(edited.status(), 200, await edited.text()); assert.equal((await edited.json()).booking.happyDiscount, 150);
    const invalidEdit = await staff.request.put(`/api/bookings/${booking.id}`, { data: { ...payload, duration: .5 }, headers: { origin: baseURL } }); assert.ok([400, 409].includes(invalidEdit.status()));
    const cancel = await account.request.patch(`/api/bookings/${booking.id}`, { data: { status: 'CANCELLED' }, headers: { origin: baseURL } }); assert.equal(cancel.status(), 200, await cancel.text());
    assert.equal((await prisma.happyTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, 'CLAIMED');
    assert.equal((await staff.request.delete(`/api/bookings/${booking.id}`, { headers: { origin: baseURL } })).status(), 409);
    const spinRequest = { requestId: randomUUID(), spinDate: dateKey(now) };
    const spin = await post(account, '/api/daily-spin', spinRequest); assert.equal(spin.status(), 200, await spin.text());
    const spinResult = await spin.json();
    assert.equal((await (await post(account, '/api/daily-spin', spinRequest)).json()).spinRecord.id, spinResult.spinRecord.id);
    assert.equal((await account.request.get(`/api/daily-spin/receipts/${spinRequest.requestId}`)).status(), 200);
    assert.equal((await other.request.get(`/api/daily-spin/receipts/${spinRequest.requestId}`)).status(), 404);
    const poolResponse = await anonymous.request.get('/api/happy-tickets'); const pool = await poolResponse.json();
    assert.equal(pool.wallet, null); assert.equal(JSON.stringify(pool).includes(owner.email), false);
    const interrupted = await other.newPage();
    await interrupted.goto('/happy-tickets');
    await interrupted.getByRole('button', { name: 'Claim your free hour' }).waitFor();
    await interrupted.route('**/api/happy-tickets/claim', async route => { await route.fetch(); await route.abort('failed'); });
    await interrupted.getByRole('button', { name: 'Claim your free hour' }).click();
    await interrupted.getByRole('button', { name: 'Check result / Retry' }).waitFor();
    await interrupted.unroute('**/api/happy-tickets/claim'); await interrupted.reload();
    await interrupted.getByRole('button', { name: 'Check result / Retry' }).click();
    await interrupted.getByText('Happy Ticket claimed! One free base PS5 hour.').waitFor();
    assert.equal(await prisma.happyTicket.count({ where: { userId: outsider.id } }), 1);
    const errors = [];
    const page = await account.newPage(); page.on('pageerror', e => errors.push(e.message));
    for (const width of [320,375,430,1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/happy-tickets'); await page.getByRole('heading', { name: 'Happy Tickets', exact: true }).first().waitFor();
      await page.getByRole('button', { name: /Next claim/ }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Happy Tickets overflow at ${width}`);
      await page.screenshot({ path: path.join(output, `happy-${width}.png`), fullPage: true });

    }
    const adminPage = await staff.newPage();
    for (const width of [320,375,430,1440]) {
      await adminPage.setViewportSize({ width, height: 900 }); await adminPage.goto('/admin/happy-tickets');
      await adminPage.getByRole('heading', { name: 'Guild Resets', exact: true }).waitFor();
      assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Admin overflow at ${width}`);
      await adminPage.screenshot({ path: path.join(output, `admin-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 375, height: 900 }); await page.goto('/daily-spin');
    await page.getByLabel('Legendary guarantee').waitFor(); await page.screenshot({ path: path.join(output, 'spin-375.png'), fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/happy-tickets');
    await page.getByRole('button', { name: /Next claim/ }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Refresh Happy Tickets"]').disabled);
    await page.getByRole('button', { name: 'Refresh Happy Tickets' }).focus(); assert.ok(await page.getByRole('button', { name: 'Refresh Happy Tickets' }).evaluate(el => el === document.activeElement));
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } });
    assert.equal((await staff.request.get('/api/admin/happy-tickets')).status(), 403);
    assert.deepEqual(errors, []);
    console.log('Browser/API checks passed. Screenshots:', output);
  } finally { await browser.close(); await prisma.$disconnect(); }
})().catch(async error => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
