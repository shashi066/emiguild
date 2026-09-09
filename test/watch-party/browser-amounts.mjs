// node --env-file=.env.local test/watch-party/browser-amounts.mjs <path-to-playwright/index.mjs>
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';

const { chromium } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : 'playwright');
assert.ok(process.env.DATABASE_URL?.startsWith('file:'), 'Use local SQLite for disposable browser fixtures.');
const baseURL = 'http://localhost:3000';
const db = new PrismaClient();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const output = join(tmpdir(), `emic-amounts-${Date.now()}`);
await mkdir(output, { recursive: true });
const users = [];
const parties = [];
const contexts = [];
const errors = [];

async function createSession(role) {
  const user = await db.user.create({ data: {
    name: `EMIC Browser ${role}`, email: `emic-browser-${role}-${Date.now()}@example.com`,
    password: 'not-a-login', role, watchPartyCoins: 12_345_678,
  } });
  users.push(user);
  const context = await browser.newContext({ baseURL });
  contexts.push(context);
  const cookie = 'authjs.session-token';
  const value = await encode({ token: { id: user.id, role, name: user.name, email: user.email }, secret: process.env.AUTH_SECRET, salt: cookie });
  await context.addCookies([{ name: cookie, value, url: baseURL, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && /hydrat/i.test(message.text())) errors.push(message.text()); });
  return { user, page };
}

async function checkAmounts(page, label) {
  await page.locator('.emicoin-amount:visible').first().waitFor();
  const amounts = await page.locator('.emicoin-amount:visible').evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    const image = element.querySelector('img');
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left, right: rect.right, width: element.clientWidth, scroll: element.scrollWidth,
      gap: style.gap, background: style.backgroundImage, shadow: style.boxShadow, border: style.borderWidth,
      imageWidth: image.getBoundingClientRect().width, imageHeight: image.getBoundingClientRect().height,
      filter: getComputedStyle(image).filter, text: element.querySelector('.emicoin-value').textContent,
      accessible: element.querySelector('.emicoin-sr').textContent,
    };
  }));
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  assert.ok(dimensions.page <= dimensions.viewport + 1, `${label}: page overflow`);
  for (const amount of amounts) {
    assert.ok(amount.left >= -1 && amount.right <= dimensions.viewport + 1, `${label}: amount outside viewport`);
    assert.ok(amount.scroll <= amount.width + 1, `${label}: amount overflow`);
    assert.equal(amount.gap, '6px');
    assert.equal(amount.background, 'none');
    assert.equal(amount.shadow, 'none');
    assert.equal(amount.border, '0px');
    assert.equal(amount.filter, 'none');
    assert.equal(amount.imageWidth, 22);
    assert.equal(amount.imageHeight, 22);
    assert.equal(amount.text.includes('EMIC'), false);
    assert.ok(amount.accessible.includes('EMIC'));
  }
  await page.screenshot({ path: join(output, `${label}.png`), fullPage: true, animations: 'disabled', caret: 'initial' });
}

try {
  const player = await createSession('USER');
  const admin = await createSession('ADMIN');
  const now = new Date();
  for (const settled of [false, true]) {
    const party = await db.watchParty.create({ data: {
      title: `EMIC Layout ${settled ? 'Result' : 'Live'} ${Date.now()}`, homeTeam: 'City', awayTeam: 'United', status: 'ACTIVE',
      kickoffAt: new Date(now.getTime() + 86400000), predictionStatus: settled ? 'SETTLED' : 'OPEN',
    } });
    parties.push(party);
    await db.watchPartyInvite.create({ data: {
      partyId: party.id, userId: player.user.id, checkedInAt: now, enteredAt: now, entryPaid: true, entryCreditedAt: now,
    } });
    if (settled) await db.watchPartyPrediction.create({ data: {
      partyId: party.id, userId: player.user.id, optionKey: 'HOME', optionLabel: 'City Wins',
      stakeUnits: 250, payoutUnits: 875, status: 'WON', multiplierBasisPoints: 35000,
    } });
  }
  await db.watchPartyShopOrder.create({ data: {
    userId: player.user.id, itemKey: 'EMIC_BROWSER_DRINK', itemType: 'DRINK', itemLabel: 'Layout Drink', itemCategory: 'Drinks',
    tokenCost: 500, tokenCostUnits: 5000,
  } });

  for (const width of [320, 360, 412, 1280]) {
    const page = player.page;
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/watch-party');
    assert.equal(await page.locator('.watch-wallet .emicoin-value').innerText(), '12,34,567.8');
    const wallet = await page.locator('.watch-wallet').evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderWidth, height: element.getBoundingClientRect().height };
    });
    assert.equal(wallet.background, 'rgba(0, 0, 0, 0)');
    assert.equal(wallet.border, '0px');
    assert.equal(wallet.height, 44);
    await page.locator('.watch-wallet img').waitFor();
    await page.waitForFunction(() => document.querySelector('.watch-wallet img')?.naturalWidth > 0);
    await checkAmounts(page, `watch-party-${width}`);
    await page.getByRole('button', { name: 'Open EMIC Rewards', exact: true }).click();
    await page.getByRole('button', { name: 'Close EMIC Rewards', exact: true }).waitFor();
    await checkAmounts(page, `rewards-${width}`);
    await page.getByRole('button', { name: 'Food & Drink Rewards', exact: true }).click();
    await checkAmounts(page, `drinks-${width}`);
    await page.getByRole('button', { name: 'My Tickets', exact: true }).click();
    await page.getByRole('heading', { name: 'Layout Drink', exact: true }).waitFor();
    await checkAmounts(page, `tickets-${width}`);
    await page.getByRole('button', { name: 'Close EMIC Rewards', exact: true }).click();
    await page.goto(`/watch-party/${parties[0].id}`);
    await page.locator('.watch-token-controls button').first().click();
    assert.equal(await page.locator('.watch-token-controls button').first().getAttribute('aria-pressed'), 'true');
    const targetSizes = await page.locator('.watch-token-controls button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    assert.ok(targetSizes.every((height) => height >= 44));
    await page.locator('.watch-option').first().click();
    assert.equal(await page.getByRole('button', { name: 'Confirm Fan Pick', exact: true }).isEnabled(), true);
    await checkAmounts(page, `fan-pick-${width}`);
    await page.goto(`/watch-party/${parties[1].id}`);
    await page.locator('.watch-ticket').waitFor();
    await page.locator('.watch-leaderboard').waitFor();
    await checkAmounts(page, `result-${width}`);
    await admin.page.setViewportSize({ width, height: 850 });
    await admin.page.goto('/admin/watch-parties');
    await admin.page.locator('.watch-ticket-admin-list').getByText('Layout Drink', { exact: true }).waitFor();
    await checkAmounts(admin.page, `admin-${width}`);
  }

  await db.user.update({ where: { id: player.user.id }, data: { watchPartyCoins: 0 } });
  await player.page.goto('/watch-party');
  assert.equal(await player.page.locator('.watch-wallet .emicoin-value').innerText(), '0');
  const anonymous = await browser.newContext({ baseURL, viewport: { width: 320, height: 850 } });
  contexts.push(anonymous);
  const anon = await anonymous.newPage();
  await anon.goto('/watch-party');
  assert.equal(await anon.locator('.watch-wallet .emicoin-value').innerText(), '--');
  await checkAmounts(anon, 'anonymous-320');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'Passed', screenshots: output, viewports: [320, 360, 412, 1280] }));
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await db.watchParty.deleteMany({ where: { id: { in: parties.map((party) => party.id) } } });
  await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await db.$disconnect();
}
