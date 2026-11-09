// Presentation-only Chrome checks against a running loopback application.
// Every game action is fulfilled locally: no real runs, bonuses or rewards spent.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const base = process.env.GUESS36_UI_BASE_URL || 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Use a loopback review app.');
if (!process.env.GUESS36_REVIEW_EMAIL || !process.env.GUESS36_REVIEW_PASSWORD) throw Error('Supply an existing review login through the environment.');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'g36-ui-polish-'));
const checks = [], errors = [];
const ok = name => { checks.push(name); console.log('PASS ' + name); };
const tile = (page, i, label = 'hidden') => page.getByRole('button', { name: `Tile ${i + 1}${label === 'hidden' ? ', hidden' : ': ' + label}`, exact: true });
const json = value => ({ status: 200, contentType: 'application/json', json: value });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const auth = await browser.newContext();
    const csrf = await (await auth.request.get(base + '/api/auth/csrf')).json();
    await auth.request.post(base + '/api/auth/callback/credentials', { form: { csrfToken: csrf.csrfToken, email: process.env.GUESS36_REVIEW_EMAIL, password: process.env.GUESS36_REVIEW_PASSWORD, callbackUrl: base }, headers: { origin: base } });
    assert.ok((await (await auth.request.get(base + '/api/auth/session')).json()).user?.id, 'Existing review login required.');
    const original = await (await auth.request.get(base + '/api/guess-36/current')).json();
    const storageState = await auth.storageState(); await auth.close();
    const ready = () => ({ ...original, authenticated: true, enabled: true, legacyUsedToday: false, run: null, rewardTickets: [], eligibility: { ...original.eligibility, freeAvailable: true, bonuses: [{ id: 'ui-spare-bonus', expiresAt: original.nextDayAt }], review: { ...original.eligibility.review, claimed: true } } });

    for (const width of [320, 375, 430, 1280]) {
      const context = await browser.newContext({ storageState, viewport: { width, height: 812 } });
      let state = ready(), release, wait, block = false, runSequence = 0;
      let documentRequests = 0, mutations = 0;
      await context.route(/\/api\/assistant(?:\/|\?|$)/, route => route.fulfill({ status: 503, contentType: 'application/json', json: { error: 'No assistant actions in presentation tests.' } }));
      await context.route('**/api/guess-36/**', async route => {
        const request = route.request(), pathname = new URL(request.url()).pathname;
        if (pathname.endsWith('/current')) return route.fulfill(json({ ...state, serverNow: new Date().toISOString() }));
        if (pathname.endsWith('/review-token')) return route.abort('blockedbyclient');
        mutations++;
        if (block) await wait;
        const body = request.postDataJSON(), at = new Date().toISOString();
        if (pathname.endsWith('/reveal')) {
          const prior = state.run?.status === 'ACTIVE' ? state.run : null;
          if (!prior) runSequence++;
          const color = body.index === 5 ? 'RED' : body.index === 1 ? 'YELLOW' : 'GREEN';
          const tiles = [...(prior?.tiles ?? []), { index: body.index, color }];
          const greens = tiles.filter(t => t.color === 'GREEN').length;
          state = { ...state, eligibility: { ...state.eligibility, freeAvailable: false }, run: {
            id: `ui-run-${runSequence}`, date: state.date, status: color === 'RED' ? 'LOST' : greens === 5 ? 'COMPLETED' : 'ACTIVE',
            version: (prior?.version ?? 0) + 1, startedAt: prior?.startedAt ?? at, expiresAt: prior?.expiresAt ?? new Date(Date.now() + 90000).toISOString(), settledAt: color === 'RED' || greens === 5 ? at : null,
            tiles, greens, reward: color === 'RED' || !greens ? null : state.rules.rewards[greens - 1], nextReward: state.rules.rewards[greens] ?? null, ticketId: null, ticket: null,
          } };
        } else if (pathname.endsWith('/collect')) {
          state = { ...state, run: { ...state.run, status: 'COLLECTED', version: state.run.version + 1, settledAt: at, nextReward: null, ticketId: 'ui-ticket', ticket: { id: 'ui-ticket', status: 'UNUSED', expiresAt: original.nextDayAt } } };
        } else throw Error('Unexpected game request: ' + pathname);
        return route.fulfill(json({ run: state.run, serverNow: at, eligibility: state.eligibility }));
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (request.isNavigationRequest() && request.resourceType() === 'document') documentRequests++; });
      await page.goto(base + '/guess-36'); await page.getByRole('button', { name: 'Play free daily run', exact: true }).waitFor({ timeout: 30000 });
      const opener = page.getByRole('button', { name: 'Open Emiily chat and help', exact: true });
      assert.equal(await opener.count(), 0, 'Emiily is limited to the homepage');
      const bounds = await tile(page, 0).boundingBox();
      assert.ok(bounds.width >= 44 && bounds.height >= 44, JSON.stringify(bounds));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width === 375) {
        const info = page.getByRole('button', { name: 'Guild Expedition rules', exact: true });
        await info.click(); const dialog = page.getByRole('dialog'); await dialog.waitFor();
        await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
        assert.equal(await info.evaluate(el => el === document.activeElement), true);
        ok('mobile Info closes and restores keyboard focus without an assistant overlay');
      }
      await page.screenshot({ path: path.join(out, `ready-${width}.png`), fullPage: true });
      const beforeDocuments = documentRequests;
      const root = await page.locator('[aria-label="Guess 36 Guild Expedition"]').elementHandle();
      await page.getByRole('button', { name: 'Play free daily run', exact: true }).click();
      if (width === 375) {
        block = true; wait = new Promise(resolve => { release = resolve; });
        await page.waitForFunction(() => {
          const tile = document.querySelector('[aria-label="Tile 2, hidden"] > span');
          return tile && getComputedStyle(tile).opacity === '1';
        });
        const opacity = await tile(page, 1).locator('> span:first-child').evaluate(el => getComputedStyle(el).opacity);
        await tile(page, 0).click(); await page.waitForTimeout(200);
        assert.equal(await tile(page, 1).locator('> span:first-child').evaluate(el => getComputedStyle(el).opacity), opacity);
        assert.equal(await tile(page, 0).getAttribute('aria-busy'), 'true');
        assert.equal(await tile(page, 1).isEnabled(), false);
        const reel = tile(page, 0).locator('[data-k]'); assert.equal(await reel.count(), 3);
        assert.equal(await reel.first().evaluate(el => getComputedStyle(el).animationIterationCount), '4');
        await page.getByRole('status').filter({ hasText: 'Checking tile.' }).waitFor();
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
        await page.waitForFunction(() => document.querySelector('[data-background]'));
        assert.equal(await reel.first().evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
        await page.waitForTimeout(5100);
        assert.ok(await reel.first().evaluate(el => el.getAnimations().every(animation => animation.playState === 'finished')));
        release(); block = false;
        ok('slow first reveal locks duplicate picks, announces pending and bounds motion; simulated background pauses it');
      } else await tile(page, 0).click();
      const collect = page.getByRole('button', { name: 'Collect 15 min', exact: true }); await collect.waitFor();
      const reward = page.locator('strong[data-bump]'); await reward.waitFor();
      assert.ok(await reward.evaluate(el => new Promise(resolve => {
        let frames = 0, contained = true;
        const sample = () => {
          contained &&= el.getBoundingClientRect().left >= el.parentElement.getBoundingClientRect().left - 0.5;
          if (++frames < 30) requestAnimationFrame(sample); else resolve(contained);
        };
        sample();
      })), 'reward reveal must stay inside the HUD');
      await page.evaluate(() => scrollTo(0, 0));
      const action = await collect.boundingBox();
      if (width <= 430) {
        assert.ok(action.y + action.height <= 796, JSON.stringify(action));
      }
      assert.ok(await collect.evaluate(el => getComputedStyle(el).animationIterationCount !== 'infinite'), 'action feedback is bounded');
      const ladder = page.getByRole('list', { name: '1 of 5 rewards found', exact: true });
      assert.deepEqual(await ladder.locator('li').allTextContents(), ['15m', '30m', '1h', '2h', 'Bronze']);
      assert.equal(await ladder.locator('li[aria-current="step"]').innerText(), '15m');
      await page.screenshot({ path: path.join(out, `active-${width}.png`), fullPage: true });
      assert.equal(documentRequests, beforeDocuments);
      if (width === 375) {
        const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await tile(page, 2).click(); await page.getByRole('button', { name: 'Collect 30 min', exact: true }).waitFor(); await cdp.detach();
        assert.equal(await page.getByRole('list', { name: '2 of 5 rewards found', exact: true }).locator('li[data-state="found"]').count(), 1);
        await page.getByRole('button', { name: 'Collect 30 min', exact: true }).click(); await page.getByText('Reward secured', { exact: true }).waitFor();
        assert.equal(await page.getByText('TIME LEFT', { exact: true }).count(), 0);
        assert.equal(await page.getByText('FINAL REWARD', { exact: true }).count(), 1);
        await page.getByRole('button', { name: /Play again.*bonus run/, exact: true }).click();
        assert.equal(await page.locator('[data-fresh]').count(), 0, 'previous highlights cannot leak into a fast bonus restart');
        ok('reward stages advance, terminal timer disappears and fast bonus restart clears feedback');
        await tile(page, 0).click(); await page.getByRole('button', { name: 'Collect 15 min', exact: true }).waitFor();
        block = true; wait = new Promise(resolve => { release = resolve; });
        await collect.click(); await page.getByRole('button', { name: 'Guild Expedition rules', exact: true }).click();
        const info = page.getByRole('dialog'); await info.waitFor(); await info.evaluate(el => el.scrollTop = 35);
        const scroll = await info.evaluate(el => el.scrollTop);
        release(); block = false; await page.getByText('Reward secured', { exact: true }).waitFor({ state: 'attached' });
        assert.equal(await info.isVisible(), true); assert.equal(await info.evaluate(el => el.scrollTop), scroll);
        await page.keyboard.press('Escape');
        assert.equal(await root.evaluate(el => el.isConnected), true); assert.equal(documentRequests, beforeDocuments);
        await page.screenshot({ path: path.join(out, 'secured-375.png'), fullPage: true });
        ok('collection preserves the page, revealed board and open Info modal');
        await page.getByRole('button', { name: /Play again.*bonus run/, exact: true }).click(); await tile(page, 0).click(); await collect.waitFor();
        await tile(page, 5).click(); await page.getByText('Game Over', { exact: true }).waitFor();
        assert.equal(await page.getByText('TIME LEFT', { exact: true }).count(), 0);
        assert.equal(await page.getByRole('list', { name: '1 of 5 rewards found', exact: true }).locator('li[aria-current="step"]').count(), 1);
        await page.screenshot({ path: path.join(out, 'lost-375.png'), fullPage: true });
      }
      assert.ok(mutations > 0);
      ok(`${width}px: 44px tiles, readable first reward segment, no overflow and clear Collect area`);
      if (width === 430) {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        block = true; wait = new Promise(resolve => { release = resolve; });
        await tile(page, 2).click();
        const layers = tile(page, 2).locator('[data-k]'); await layers.first().waitFor({ state: 'attached' });
        assert.equal(await layers.first().evaluate(el => getComputedStyle(el).animationName), 'none');
        assert.equal(await layers.first().evaluate(el => getComputedStyle(el).opacity), '0');
        release(); block = false;
        await page.getByRole('button', { name: 'Collect 30 min', exact: true }).waitFor();
        assert.equal(await tile(page, 2, 'loot').locator('> span:first-child').evaluate(el => getComputedStyle(el).animationName), 'none');
        await page.goto(base + '/'); await opener.waitFor();
        await page.waitForFunction(() => !!document.querySelector('.emi-assistant > .emi-launcher'));
        await opener.click(); const assistant = page.getByRole('dialog', { name: 'Emiily, the EmiGuild assistant' }); await assistant.waitFor();
        await assistant.getByRole('link', { name: 'Games', exact: true }).click(); await page.waitForURL(base + '/games');
        assert.equal(await opener.count(), 0); assert.equal(await assistant.count(), 0);
        await page.goBack(); await opener.waitFor(); assert.equal(await assistant.count(), 0);
        await opener.click(); await assistant.waitFor(); await page.keyboard.press('Escape');
        assert.equal(await opener.evaluate(el => el === document.activeElement), true);
        ok('reduced motion stays static; Emiily is homepage-only and closes cleanly on navigation');
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ checks: checks.length, errors, artifacts: out, mode: 'mocked UI only; no game mutations forwarded', physicalAndroidTested: false }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); console.error('Artifacts: ' + out); process.exitCode = 1; });
