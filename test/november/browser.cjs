const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const baseURL = process.env.NOVEMBER_BROWSER_URL || 'http://127.0.0.1:3006';
if (!['localhost','127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Use a loopback disposable test server.');
if (!process.env.DATABASE_URL?.includes('november-test') || process.env.DATABASE_URL !== process.env.NOVEMBER_TEST_DATABASE_URL) throw new Error('Browser checks require the disposable November database.');
const prisma = new PrismaClient();
const password = 'November-fixture-only-123';
const now = new Date();
const dateKey = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
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
  // Configuration is read from the existing internal Settings entry.
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
    // Booking pricing/restoration runs in booking-http.test.cjs with a controlled
    // clock. Live browser checks must not book tomorrow using a same-day ticket.
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
    await interrupted.getByRole('button', { name: /Claim Ticket/ }).waitFor();
    await interrupted.route('**/api/happy-tickets/claim', async route => { await route.fetch(); await route.abort('failed'); });
    await interrupted.getByRole('button', { name: /Claim Ticket/ }).click();
    await interrupted.getByRole('button', { name: /Check claim result|Check result \/ Retry/ }).waitFor();
    await interrupted.unroute('**/api/happy-tickets/claim'); await interrupted.reload();
    await interrupted.getByRole('button', { name: /Check claim result|Check result \/ Retry/ }).click();
    await interrupted.getByText('Your ticket is ready').waitFor();
    assert.equal(await prisma.happyTicket.count({ where: { userId: outsider.id } }), 1);
    const errors = [];
    const page = await account.newPage(); page.on('pageerror', e => errors.push(e.message));
    for (const width of [320,375,430,1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/happy-tickets'); await page.getByRole('heading', { name: 'Happy Tickets', exact: true }).first().waitFor();
      await page.getByRole('button', { name: /Claimed/ }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Happy Tickets overflow at ${width}`);
      await page.screenshot({ path: path.join(output, `happy-${width}.png`), fullPage: true });

    }
    const adminPage = await staff.newPage();
    for (const width of [320,375,430,1440]) {
      await adminPage.setViewportSize({ width, height: 900 }); await adminPage.goto('/admin/happy-tickets');
      await adminPage.getByRole('region', { name: 'tickets table' }).waitFor();
      await adminPage.getByRole('button', { name: 'Members', exact: true }).click();
      await adminPage.getByPlaceholder('Search name or email').fill(owner.email);
      await adminPage.getByRole('button', { name: 'Search', exact: true }).click();
      await adminPage.getByRole('button', { name: `View ${owner.name}`, exact: true }).click();
      await adminPage.getByRole('dialog').getByText(owner.email, { exact: true }).waitFor();
      await adminPage.getByRole('dialog').press('Escape');
      await adminPage.getByRole('button', { name: 'Resets', exact: true }).click();
      await adminPage.getByRole('button', { name: 'Refill accounts', exact: true }).click();
      const dialog = adminPage.getByRole('dialog', { name: 'Refill accounts' });
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('button', { name: 'Confirm', exact: true }).isEnabled(), false);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 15 && bounds.x + bounds.width <= width - 15);
      await dialog.press('Escape');
      assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Admin overflow at ${width}`);
      await adminPage.screenshot({ path: path.join(output, `admin-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 375, height: 900 }); await page.goto('/daily-spin');
    await page.getByLabel('Legendary guarantee').waitFor(); await page.screenshot({ path: path.join(output, 'spin-375.png'), fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/happy-tickets');
    await page.getByRole('button', { name: /Claimed/ }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Refresh Happy Tickets"]').disabled);
    await page.getByRole('button', { name: 'Refresh Happy Tickets' }).focus(); assert.ok(await page.getByRole('button', { name: 'Refresh Happy Tickets' }).evaluate(el => el === document.activeElement));
    // Returning to the page fires both events; coalesce them into one GET.
    let reads = 0;
    const countRead = request => { if (new URL(request.url()).pathname === '/api/happy-tickets') reads++; };
    page.on('request', countRead);
    const resumed = page.waitForResponse(r => new URL(r.url()).pathname === '/api/happy-tickets');
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await resumed; await page.waitForTimeout(250); assert.equal(reads, 1);
    page.off('request', countRead);
    // Stall only GET; timeout must leave loaded tickets visible and allow retry.
    await page.route('**/api/happy-tickets', () => {});
    await page.getByRole('button', { name: 'Refresh Happy Tickets' }).click();
    await page.getByText('Loading took too long. Please retry.', { exact: true }).waitFor({ timeout: 25_000 });
    await page.getByRole('button', { name: /Claimed/ }).waitFor();
    await page.unroute('**/api/happy-tickets');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('Loading took too long. Please retry.', { exact: true }).waitFor({ state: 'hidden' });
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } });
    assert.equal((await staff.request.get('/api/admin/happy-tickets')).status(), 403);
    assert.deepEqual(errors, []);
    console.log('Browser/API checks passed. Screenshots:', output);
  } finally { await browser.close(); await prisma.$disconnect(); }
})().catch(async error => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
