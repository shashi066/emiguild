// Run against a local server: node --env-file=.env.local test/guess-36/browser-check.mjs <path-to-playwright/index.mjs>
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';

const { chromium } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : 'playwright');
const baseURL = process.env.GUESS_36_TEST_URL ?? 'http://localhost:3000';
assert.ok(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseURL), 'Only run fixture-based browser checks locally.');
assert.ok(process.env.DATABASE_URL?.startsWith('file:'), 'Browser fixtures require local SQLite.');
const db = new PrismaClient();
const output = join(tmpdir(), `guess36-browser-${Date.now()}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const users = [];
const fixtureRounds = [];
const contexts = [];
const pageErrors = [];
const viewports = [320, 360, 375, 390, 412, 430, 1280];
const mobileViewports = viewports.filter((width) => width < 720);
const settingKeys = ['guess_36_enabled', 'guess_36_rewards', 'guess_36_modes'];
const settings = await db.setting.findMany({ where: { key: { in: settingKeys } } });
const preservedEntries = await db.guess36Entry.findMany({ orderBy: { id: 'asc' } });

async function createUser(role, name = `Browser ${role}`) {
  const user = await db.user.create({ data: { name, role, email: `guess36-browser-${role}-${Date.now()}-${users.length}@example.com`, password: 'not-a-login' } });
  users.push(user);
  return user;
}

async function session(role, existingUser) {
  const user = existingUser ?? await createUser(role);
  const context = await browser.newContext({ baseURL, viewport: { width: 360, height: 800 } });
  contexts.push(context);
  const cookieName = 'authjs.session-token';
  const value = await encode({ token: { id: user.id, role, name: user.name, email: user.email }, secret: process.env.AUTH_SECRET, salt: cookieName });
  await context.addCookies([{ name: cookieName, value, url: baseURL, httpOnly: true, sameSite: 'Lax' }]);
  return context;
}

async function fit(page, label, selector = 'body') {
  await page.waitForFunction(() => {
    const root = document.querySelector('.guess-36-client, .guess-36-admin');
    return !root || getComputedStyle(root).display === 'grid';
  });
  const dimensions = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    const rect = element.getBoundingClientRect();
    return { viewport: innerWidth, page: document.documentElement.scrollWidth, left: rect.left, right: rect.right, client: element.clientWidth, scroll: element.scrollWidth };
  }, selector);
  assert.ok(dimensions.page <= dimensions.viewport + 1, `${label}: page overflow ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.left >= -1 && dimensions.right <= dimensions.viewport + 1, `${label}: outside viewport ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.scroll <= dimensions.client + 1, `${label}: inner overflow ${JSON.stringify(dimensions)}`);
}

async function screenshot(page, name) {
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true, animations: 'disabled', caret: 'initial' });
}

try {
  await db.setting.upsert({ where: { key: 'guess_36_enabled' }, update: { value: 'true' }, create: { key: 'guess_36_enabled', value: 'true' } });
  await db.setting.upsert({ where: { key: 'guess_36_modes' }, update: { value: '["NUMBER","PARITY","RANGE"]' }, create: { key: 'guess_36_modes', value: '["NUMBER","PARITY","RANGE"]' } });
  const anonymous = await browser.newContext({ baseURL, viewport: { width: 320, height: 800 } });
  contexts.push(anonymous);
  const anon = await anonymous.newPage();
  assert.equal((await anonymous.request.post('/api/guess-36/entries', { data: {} })).status(), 401);
  assert.equal((await anonymous.request.get('/api/admin/guess-36/config')).status(), 403);
  for (const oldPath of ['/lucky-hour', '/emi-36', '/api/lucky-hour/current', '/api/cron/lucky-hour/draw']) {
    const legacyPage = await anonymous.request.get(oldPath, { maxRedirects: 0 });
    assert.equal(legacyPage.status(), 404, oldPath);
    assert.equal(legacyPage.headers().location, undefined);
  }
  await anon.goto('/guess-36');
  assert.equal(new URL(anon.url()).pathname, '/guess-36');
  await anon.getByRole('heading', { name: 'Login to make today\'s pick' }).waitFor();
  assert.equal(await anon.locator('.guess-36-state-card').getByRole('link', { name: 'Login', exact: true }).getAttribute('href'), '/login?callbackUrl=/guess-36');
  await fit(anon, 'Logged out');
  await screenshot(anon, 'logged-out-320');

  const player = await session('USER');
  const admin = await session('ADMIN');
  for (const oldPath of ['/admin/lucky-hour', '/api/admin/lucky-hour/config']) {
    assert.equal((await admin.request.get(oldPath, { maxRedirects: 0 })).status(), 404, oldPath);
  }
  for (let index = 1; index <= 10; index += 1) {
    const roundDate = `1998-01-${String(index).padStart(2, '0')}`;
    if (!await db.guess36Round.findUnique({ where: { roundDate } })) fixtureRounds.push(await db.guess36Round.create({ data: {
      roundDate, status: 'DRAWN', winningNumber: index * 3, publishedAt: new Date('1998-02-01T00:00:00Z'),
    } }));
  }
  const ticketRewards = [{ type: 'GAMING_TIME', value: 60, name: '60 Minutes Gaming' }, { type: 'PASS', name: 'Weekend Hero Pass' }];
  const fixtureTickets = [];
  for (const [index, reward] of ticketRewards.entries()) fixtureTickets.push(await db.armoryTicket.create({ data: {
    userId: users[0].id, source: 'GUESS_36', code: `BROWSER-${Date.now()}-${index}`, claimDate: '1998-01-01',
    rewardSnapshot: JSON.stringify({ reward }), expiresAt: new Date(Date.now() + 86400000),
  } }));
  const current = await (await player.request.get('/api/guess-36/current')).json();
  assert.equal(current.rewardTickets.length, 2);
  assert.equal(current.history.length, 10);
  for (const ticket of current.rewardTickets) assert.deepEqual(Object.keys(ticket).sort(), ['expiresAt', 'id', 'reward']);
  const page = await player.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && /hydrat/i.test(message.text())) pageErrors.push(message.text()); });
  const requests = [];
  page.on('request', (request) => { if (request.url().includes('/api/guess-36/')) requests.push(request.url()); });
  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/guess-36');
    await page.getByRole('button', { name: 'Number 1', exact: true }).first().waitFor();
    await page.waitForFunction(() => {
      const grid = document.querySelector('.guess-36-number-grid');
      return grid && getComputedStyle(grid).display === 'grid';
    });
    await page.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
    assert.equal(await page.locator('.guess-36-number-grid button').count(), 36);
    const sizes = await page.locator('.guess-36-number-grid button').evaluateAll((items) => items.map((item) => ({ width: item.getBoundingClientRect().width, height: item.getBoundingClientRect().height })));
    assert.ok(sizes.every((size) => size.width >= 44 && size.height >= 44), `${width}: undersized targets ${JSON.stringify(sizes)}`);
    await fit(page, `Number ${width}`, '.guess-36-number-grid');
    await screenshot(page, `numbers-${width}`);
    await page.getByRole('button', { name: 'Number 36', exact: true }).first().click();
    const liveBox = await page.locator('.guess-36-announcement').boundingBox();
    assert.ok(liveBox.width <= 1 && liveBox.height <= 1, 'Live announcement must remain visually hidden.');
    assert.equal(await page.locator('.guess-36-number-grid button:disabled').count(), 0);
    assert.equal(await page.locator('.guess-36-modes button:disabled').count(), 0);
    await page.getByRole('button', { name: 'Number 12', exact: true }).click();
    assert.equal(await page.locator('.guess-36-number-grid .selected span').innerText(), '12');
    assert.equal(await page.locator('.guess-36-selection-bar').count(), 1);
    await page.getByRole('button', { name: 'Number 24', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Change Pick' }).count(), 0);
    await page.getByRole('button', { name: 'Even/Odd', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Lock In My Pick', exact: true }).count(), 0);
    await page.getByRole('button', { name: /^Even: covers/ }).first().click();
    assert.match(await page.locator('.guess-36-groups button[aria-pressed="true"]').innerText(), /Even\s+18 numbers/);
    await page.getByRole('button', { name: /^Odd: covers/ }).click();
    assert.match(await page.locator('.guess-36-groups button[aria-pressed="true"]').innerText(), /Odd\s+18 numbers/);
    assert.equal(await page.locator('.guess-36-groups button[aria-pressed="true"] .guess-36-group-number-table > span').first().evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(0, 217, 255)');
    assert.equal(await page.locator('.guess-36-group-design-option').count(), 0);
    assert.equal(await page.locator('.guess-36-group-number-table').count(), 2);
    assert.equal(await page.locator('.guess-36-groups button[aria-pressed="true"]').count(), 1);
    assert.equal(await page.locator('.guess-36-number-grid button').count(), 0);
    await fit(page, `Parity ${width}`, '.guess-36-groups');
    await screenshot(page, `parity-${width}`);
    await page.getByRole('button', { name: 'Range', exact: true }).click();
    await page.getByRole('button', { name: /^13-24: covers/ }).click();
    assert.match(await page.locator('.guess-36-groups button[aria-pressed="true"]').innerText(), /13-24\s+12 numbers/);
    assert.equal(await page.locator('.guess-36-group-number-table').count(), 3);
    await fit(page, `Range ${width}`, '.guess-36-groups');
    await screenshot(page, `range-${width}`);
    assert.equal(await page.getByRole('button', { name: 'Row', exact: true }).count(), 0);
    assert.deepEqual(await page.locator('.guess-36-modes button').allTextContents(), ['Number', 'Even/Odd', 'Range']);
    assert.equal(await page.locator('.guess-36-groups button button').count(), 0);
    assert.equal(await page.locator('.guess-36-history-list li').count(), 10);
    assert.equal(await page.locator('.guess-36-reward-tickets article').count(), 2);
    assert.equal((await page.locator('.guess-36-reward-tickets').innerText()).includes('BROWSER-'), false);
    const order = await page.locator('.guess-36-client > section').evaluateAll((items) => items.map((item) => [...item.classList].find((name) => name.startsWith('guess-36-'))));
    assert.deepEqual(order, ['guess-36-yesterday', 'guess-36-game', ...(current.previous.status === 'DRAWN' ? ['guess-36-result'] : []), 'guess-36-history', 'guess-36-reward-tickets']);
    const highlight = page.locator('.guess-36-yesterday');
    assert.equal(await highlight.locator('time').getAttribute('datetime'), current.previous.date);
    if (current.previous.status === 'DRAWN') {
      assert.equal(await highlight.locator('.guess-36-winning-number').innerText(), String(current.previous.winningNumber));
      assert.equal(await page.locator('.guess-36-winning-number').count(), 1);
      const box = await highlight.locator('.guess-36-winning-number').boundingBox();
      assert.equal(box.width, 52);
      assert.equal(box.height, 52);
      assert.equal(await highlight.locator('.guess-36-winning-number').evaluate((element) => getComputedStyle(element).borderTopColor), 'rgb(74, 222, 128)');
    } else {
      assert.equal(await page.getByText('Result pending', { exact: true }).count(), 1);
      assert.equal(await highlight.locator('.guess-36-winning-number').count(), 0);
    }
    await fit(page, `Yesterday ${width}`, '.guess-36-yesterday');
    await fit(page, `Tickets ${width}`, '.guess-36-ticket-list');
    await fit(page, `Actions ${width}`, '.guess-36-selection-bar');
    await page.getByRole('button', { name: 'Lock In My Pick', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await fit(page, `Confirm ${width}`, '[role="dialog"]');
    assert.ok((await page.getByRole('dialog').innerText()).includes(current.today.rewards.GROUP.name));
    await screenshot(page, `confirmation-${width}`);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: 'Lock In My Pick', exact: true }).evaluate((element) => element === document.activeElement), true);
    await page.getByRole('button', { name: 'Info', exact: true }).click();
    assert.equal(await page.locator('.info-guide-steps li.has-visual').count(), 6);
    await fit(page, `Guide ${width}`, '[role="dialog"]');
    assert.match(await page.getByRole('dialog').innerText(), /midnight/);
    assert.equal(await page.locator('.info-guide-step-number').count(), 6);
    await screenshot(page, `guide-${width}`);
    await page.keyboard.press('Tab');
    assert.ok(await page.getByRole('dialog').evaluate((element) => element.contains(document.activeElement)));
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: 'Info', exact: true }).evaluate((element) => element === document.activeElement), true);
  }
  assert.equal(requests.length, 0, 'Selections and previews must not request data.');
  assert.equal((await player.request.get('/api/admin/guess-36/config')).status(), 403);
  for (const selection of [{ type: 'NUMBER', value: 37 }, { type: 'EVEN', value: 2 }, { type: 'ROW', value: 1 }, [{ type: 'EVEN' }, { type: 'NUMBER', value: 1 }]]) {
    assert.equal((await player.request.post('/api/guess-36/entries', { data: { roundDate: current.today.date, selection } })).status(), 400);
  }
  assert.equal((await player.request.post('/api/guess-36/entries', { data: { roundDate: '2000-01-01', selection: { type: 'EVEN' } } })).status(), 409);
  assert.equal((await player.request.post('/api/guess-36/entries', { data: { roundDate: current.today.date, selection: { type: 'EVEN' }, reward: 500 } })).status(), 400);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Lock In My Pick', exact: true }).click();
  let releaseSubmission;
  const submissionGate = new Promise((resolve) => { releaseSubmission = resolve; });
  await page.route('**/api/guess-36/entries', async (route) => {
    await submissionGate;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Test connection failure. Please retry.' }) });
  }, { times: 1 });
  await page.getByRole('dialog').getByRole('button', { name: 'Lock In My Pick' }).click();
  await page.getByRole('button', { name: 'Locking In...' }).waitFor();
  assert.equal(await page.locator('.guess-36-modes button:disabled').count(), 3);
  assert.equal(await page.locator('.guess-36-groups button:disabled').count(), 3);
  assert.equal(await page.getByRole('button', { name: 'Close confirmation' }).isDisabled(), true);
  assert.equal(await page.locator('.guess-36-button-spinner').evaluate((element) => getComputedStyle(element).animationName), 'none');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').isVisible(), true);
  releaseSubmission();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  assert.equal((await (await player.request.get('/api/guess-36/current')).json()).today.entry, null);
  await screenshot(page, 'confirmation-error-320');
  await page.getByRole('dialog').getByRole('button', { name: 'Lock In My Pick' }).click();
  await page.getByRole('heading', { name: "You're Locked In!" }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: "You're Locked In!" }).waitFor();
  await fit(page, 'Restored selection');
  await screenshot(page, 'locked-320');
  const duplicate = await player.request.post('/api/guess-36/entries', { data: { roundDate: current.today.date, selection: { type: 'ODD' } } });
  assert.equal(duplicate.status(), 409);
  assert.deepEqual((await duplicate.json()).entry.selection, { type: 'RANGE', value: 2 });
  await db.armoryTicket.update({ where: { id: fixtureTickets[0].id }, data: { status: 'REDEEMED' } });
  await page.reload();
  assert.equal(await page.locator('.guess-36-reward-tickets article').count(), 1);
  assert.equal((await page.locator('.guess-36-reward-tickets').innerText()).includes('Weekend Hero Pass'), true);

  const adminPage = await admin.newPage();
  adminPage.on('pageerror', (error) => pageErrors.push(error.message));
  adminPage.on('console', (message) => { if (message.type() === 'error' && /hydrat/i.test(message.text())) pageErrors.push(message.text()); });
  await adminPage.goto('/guess-36');
  await adminPage.getByRole('button', { name: 'Number 9', exact: true }).first().waitFor();
  await fit(adminPage, 'Admin player picker', '.guess-36-number-grid');
  await adminPage.getByRole('button', { name: 'Number 9', exact: true }).first().click();
  await adminPage.getByRole('button', { name: 'Lock In My Pick', exact: true }).click();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Lock In My Pick' }).click();
  await adminPage.getByRole('heading', { name: "You're Locked In!" }).waitFor();
  const config = await (await admin.request.get('/api/admin/guess-36/config')).json();
  for (const width of viewports) {
    await adminPage.setViewportSize({ width, height: 900 });
    await adminPage.goto('/admin/guess-36');
    await adminPage.getByRole('button', { name: 'Edit Rewards', exact: true }).waitFor();
    await fit(adminPage, `Admin ${width}`, '.guess-36-admin');
    await screenshot(adminPage, `admin-${width}`);
    await adminPage.getByRole('button', { name: 'Edit Rewards', exact: true }).click();
    assert.equal(await adminPage.getByRole('dialog').locator('select').count(), 3);
    assert.equal(await adminPage.getByRole('dialog').locator('input').count(), 3);
    await adminPage.locator('#reward-type-EXACT').selectOption('PASS');
    await adminPage.getByLabel('Pass Name', { exact: true }).fill('Weekend Hero Pass');
    await fit(adminPage, `Rewards popup ${width}`, '[role="dialog"]');
    await screenshot(adminPage, `reward-editor-${width}`);
    await adminPage.getByRole('button', { name: 'Cancel', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Edit Rewards', exact: true }).click();
    assert.equal(await adminPage.locator('#reward-type-EXACT').inputValue(), config.rewards.EXACT.type);
    await adminPage.keyboard.press('Escape');
    await adminPage.getByRole('dialog').waitFor({ state: 'hidden' });
    await adminPage.getByRole('button', { name: 'Edit Types', exact: true }).click();
    assert.equal(await adminPage.getByRole('dialog').getByRole('button').filter({ has: adminPage.locator('strong') }).count(), 3);
    await fit(adminPage, `Pick types popup ${width}`, '[role="dialog"]');
    await screenshot(adminPage, `pick-types-${width}`);
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  await adminPage.getByRole('button', { name: 'Edit Types', exact: true }).click();
  const rangeType = adminPage.getByRole('dialog').getByRole('button', { name: /Range Three 12-number zones/ });
  assert.equal(await rangeType.getAttribute('aria-pressed'), 'true');
  await rangeType.click();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Edit Types', exact: true }).click();
  assert.equal(await adminPage.getByRole('dialog').getByRole('button', { name: /Range Three 12-number zones/ }).getAttribute('aria-pressed'), 'true');
  await adminPage.getByRole('dialog').getByRole('button', { name: /Range Three 12-number zones/ }).click();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Save Types', exact: true }).click();
  await adminPage.getByRole('dialog').waitFor({ state: 'hidden' });
  const modePlayer = await createUser('USER', 'Mode Guard Player');
  const modeSession = await session('USER', modePlayer);
  const modeState = await (await modeSession.request.get('/api/guess-36/current')).json();
  assert.deepEqual(modeState.enabledModes, ['NUMBER', 'PARITY']);
  assert.equal((await modeSession.request.post('/api/guess-36/entries', { data: { roundDate: modeState.today.date, selection: { type: 'RANGE', value: 1 } } })).status(), 409);
  assert.equal((await modeSession.request.post('/api/guess-36/entries', { data: { roundDate: modeState.today.date, selection: { type: 'EVEN' } } })).status(), 200);
  await admin.request.put('/api/admin/guess-36/config', { data: { enabledModes: ['NUMBER', 'PARITY', 'RANGE'] } });
  await adminPage.getByRole('button', { name: 'Edit Rewards', exact: true }).click();
  await adminPage.route('**/api/admin/guess-36/config', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Test save failure. Try again.' }) }), { times: 1 });
  await adminPage.getByRole('button', { name: 'Save Rewards', exact: true }).click();
  await adminPage.getByRole('dialog').getByRole('alert').waitFor();
  await adminPage.getByRole('button', { name: 'Save Rewards', exact: true }).click();
  await adminPage.getByRole('dialog').waitFor({ state: 'hidden' });
  const publicSettings = JSON.stringify(await (await player.request.get('/api/settings')).json());
  assert.equal(publicSettings.includes('guess_36_rewards'), false);
  assert.equal(publicSettings.includes('guess_36_modes'), false);
  assert.equal((await admin.request.post('/api/admin/guess-36/draw', { data: { roundDate: current.today.date, winningNumber: 9 } })).status(), 400);
  assert.equal((await player.request.post('/api/admin/guess-36/draw', { data: { roundDate: current.today.date } })).status(), 403);
  assert.equal((await admin.request.put('/api/admin/guess-36/config', { data: { rewards: { EXACT: { type: 'PASS', name: 'Incomplete' } } } })).status(), 400);

  // Every outcome has four winners, without injecting or predicting the random draw.
  let pastDate = '2001-01-01';
  while (await db.guess36Round.findUnique({ where: { roundDate: pastDate } })) {
    pastDate = new Date(new Date(`${pastDate}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  }
  const frozenRewards = {
    EXACT: { type: 'PASS', name: 'E2E Weekend Pass' },
    GROUP: { type: 'RACING_TIME', value: 30, name: '30 Minutes Racing' },
    PARITY: { type: 'DISCOUNT', value: 10, name: '10% Booking Discount' },
  };
  const drawRound = await db.guess36Round.create({ data: { roundDate: pastDate, rewardsSnapshot: JSON.stringify(frozenRewards) } });
  fixtureRounds.push(drawRound);
  const drawEntries = [];
  for (let number = 1; number <= 36; number += 1) {
    const user = await createUser('USER', `Exact ${number} Player`);
    drawEntries.push({ roundId: drawRound.id, userId: user.id, selectionType: 'NUMBER', selectionValue: number });
  }
  for (const type of ['RANGE', 'ROW']) for (let value = 1; value <= 3; value += 1) {
    const user = await createUser('USER', `${type} ${value} Player`);
    drawEntries.push({ roundId: drawRound.id, userId: user.id, selectionType: type, selectionValue: value });
  }
  drawEntries.push({ roundId: drawRound.id, userId: users[0].id, selectionType: 'EVEN', selectionValue: null });
  drawEntries.push({ roundId: drawRound.id, userId: users[1].id, selectionType: 'ODD', selectionValue: null });
  await db.guess36Entry.createMany({ data: drawEntries });
  await adminPage.getByLabel('Round date', { exact: true }).fill(pastDate);
  await adminPage.getByRole('button', { name: 'Apply', exact: true }).click();
  await adminPage.locator('.guess-36-round-strip strong').filter({ hasText: pastDate }).waitFor();
  assert.equal(await adminPage.locator('.guess-36-record-row').count(), 25);
  await adminPage.getByRole('button', { name: 'Load More', exact: true }).click();
  await adminPage.locator('.guess-36-record-row').nth(43).waitFor();
  await adminPage.getByRole('button', { name: 'Load More', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await adminPage.locator('.guess-36-record-row').count(), 44);
  await adminPage.getByRole('button', { name: 'Draw', exact: true }).click();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await db.guess36Round.findUniqueOrThrow({ where: { id: drawRound.id } })).status, 'OPEN');
  await adminPage.getByRole('button', { name: 'Draw', exact: true }).click();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Generate Result', exact: true }).click();
  await adminPage.getByRole('dialog').waitFor({ state: 'hidden' });
  await adminPage.locator('.guess-36-round-number').waitFor();
  const drawn = await db.guess36Round.findUniqueOrThrow({ where: { id: drawRound.id } });
  assert.ok(drawn.winningNumber >= 1 && drawn.winningNumber <= 36);
  assert.equal(drawn.rewardsSnapshot, drawRound.rewardsSnapshot);
  const repeatDraw = await admin.request.post('/api/admin/guess-36/draw', { data: { roundDate: pastDate } });
  assert.equal(repeatDraw.status(), 200);
  assert.equal((await repeatDraw.json()).result.winningNumber, drawn.winningNumber);
  const winners = await (await admin.request.get(`/api/admin/guess-36?roundDate=${pastDate}&view=winners&take=25`)).json();
  assert.equal(winners.items.length, 4);
  assert.deepEqual(winners.items.map((item) => item.tier).sort(), ['EXACT', 'GROUP', 'GROUP', 'PARITY']);
  const entries = await db.guess36Entry.findMany({ where: { roundId: drawRound.id } });
  assert.equal(await db.armoryTicket.count({ where: { source: 'GUESS_36', sourceRefId: { in: entries.map((entry) => entry.id) } } }), 4);
  const number = drawn.winningNumber;
  const expectedSelections = [`NUMBER:${number}`, `${number % 2 === 0 ? 'EVEN' : 'ODD'}:`, `RANGE:${Math.ceil(number / 12)}`, `ROW:${(number - 1) % 3 + 1}`];
  assert.deepEqual(winners.items.map((item) => `${item.selection.type}:${item.selection.value ?? ''}`).sort(), expectedSelections.sort());
  for (const item of winners.items) {
    assert.deepEqual(item.ticket.reward, frozenRewards[item.tier]);
    assert.match(item.ticket.code, /^G36-[A-F0-9]{18}$/);
    assert.equal(item.ticket.status, 'UNUSED');
    const owner = users.find((user) => user.id === entries.find((entry) => entry.id === item.id).userId);
    const ownerSession = await session(owner.role, owner);
    const response = await ownerSession.request.get('/api/guess-36/current');
    assert.equal(response.headers()['cache-control'], 'no-store');
    const publicState = await response.json();
    assert.ok(publicState.history.some((round) => round.date === pastDate && round.winningNumber === number));
    const publicTicket = publicState.rewardTickets.find((ticket) => ticket.id === item.ticket.id);
    assert.deepEqual(Object.keys(publicTicket).sort(), ['expiresAt', 'id', 'reward']);
    assert.deepEqual(publicTicket.reward, frozenRewards[item.tier]);
    assert.equal(JSON.stringify(publicState).includes(item.ticket.code), false);
    const ticketPage = await ownerSession.newPage();
    ticketPage.on('pageerror', (error) => pageErrors.push(error.message));
    for (const width of mobileViewports) {
      await ticketPage.setViewportSize({ width, height: 850 });
      await ticketPage.goto('/guess-36');
      await ticketPage.getByRole('heading', { name: item.reward.name, exact: true }).waitFor();
      await fit(ticketPage, `${item.tier} ticket ${width}`, '.guess-36-ticket-list');
      await screenshot(ticketPage, `draw-ticket-${item.selection.type}-${width}`);
    }
    await ticketPage.close();
  }
  await adminPage.getByRole('tab', { name: 'Winners', exact: true }).click();
  await adminPage.locator('.guess-36-record-ticket').first().waitFor();
  for (const width of mobileViewports) {
    await adminPage.setViewportSize({ width, height: 850 });
    await fit(adminPage, `Winners ${width}`, '.guess-36-record-list');
    await screenshot(adminPage, `draw-winners-${width}`);
  }
  const passWinner = winners.items.find((item) => item.tier === 'EXACT');
  const redemptionPath = `/api/admin/guess-36/rewards/${passWinner.ticket.id}/redeem`;
  assert.equal((await anonymous.request.post(redemptionPath)).status(), 403);
  assert.equal((await player.request.post(redemptionPath)).status(), 403);
  const winnerRow = adminPage.locator('.guess-36-record-row').filter({ hasText: passWinner.ticket.code });
  await winnerRow.getByRole('button', { name: 'Mark Claimed', exact: true }).click();
  await winnerRow.getByText('Claimed', { exact: true }).waitFor();
  assert.equal((await db.armoryTicket.findUniqueOrThrow({ where: { id: passWinner.ticket.id } })).status, 'REDEEMED');
  const repeatedRedemption = await admin.request.post(redemptionPath);
  assert.equal(repeatedRedemption.status(), 200);
  assert.equal((await repeatedRedemption.json()).ticket.status, 'REDEEMED');
  const passOwner = users.find((user) => user.id === entries.find((entry) => entry.id === passWinner.id).userId);
  const passSession = await session(passOwner.role, passOwner);
  assert.deepEqual((await (await passSession.request.get('/api/guess-36/current')).json()).rewardTickets, []);
  const redeemedPage = await passSession.newPage();
  await redeemedPage.goto('/guess-36');
  assert.equal(await redeemedPage.locator('.guess-36-reward-tickets').count(), 0);
  const expiredTicket = winners.items.find((item) => item.tier === 'GROUP').ticket;
  await db.armoryTicket.update({ where: { id: expiredTicket.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await admin.request.post(`/api/admin/guess-36/rewards/${expiredTicket.id}/redeem`)).status(), 410);
  const unrelatedTicket = await db.armoryTicket.create({ data: {
    userId: users[0].id, source: 'TOWER', code: `E2E-TOWER-${Date.now()}`, claimDate: current.today.date,
    rewardSnapshot: JSON.stringify({ reward: frozenRewards.PARITY }), expiresAt: new Date(Date.now() + 86400000),
  } });
  assert.equal((await admin.request.post(`/api/admin/guess-36/rewards/${unrelatedTicket.id}/redeem`)).status(), 404);
  assert.equal((await db.armoryTicket.findUniqueOrThrow({ where: { id: unrelatedTicket.id } })).status, 'UNUSED');
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ result: 'Passed', viewports, screenshots: output, checks: 'Picker, errors, locking, admin play, popup drafts, pagination, real random draw, all winning tiers, tickets, redemption, expiry, authorization, privacy, layouts' }));
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await db.guess36Round.deleteMany({ where: { id: { in: fixtureRounds.map((round) => round.id) } } });
  for (const key of settingKeys) {
    const saved = settings.find((setting) => setting.key === key);
    if (saved) await db.setting.upsert({ where: { key }, update: { value: saved.value }, create: saved });
    else await db.setting.deleteMany({ where: { key } });
  }
  assert.deepEqual(await db.guess36Entry.findMany({ orderBy: { id: 'asc' } }), preservedEntries);
  await db.$disconnect();
}
