// Read-only Chrome regression: repeated entries and pre-existing client references.
// Uses the running local app; does not sign in, reveal tiles or claim rewards.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.MINES_BROWSER_BASE_URL || 'http://localhost:3000';
const target = new URL(base);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error('Run this check against a loopback app only.');
}

async function expectGame(page) {
  await page.getByRole('link', { name: 'Sign in to play', exact: true }).waitFor({ timeout: 30000 });
  assert.equal(await page.getByRole('heading', { name: 'Guild Expedition', exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('status').filter({ hasText: 'Loading Guess 36' }).isVisible().catch(() => false), false);
  assert.equal(await page.getByRole('button', { name: /^Tile / }).count(), 0);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  try {
    for (const oldReference of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      if (oldReference) {
        // Simulate an already-open tab's earlier named RSC reference, without
        // mocking HTTP responses or changing the actual component/JS bundle.
        await context.addInitScript(() => {
          window.__oldExpeditionReferences = 0;
          const stream = [];
          let push = Array.prototype.push;
          Object.defineProperty(stream, 'push', {
            get: () => function (...entries) {
              const transformed = entries.map(entry => {
                if (!Array.isArray(entry) || entry[0] !== 1 || typeof entry[1] !== 'string') return entry;
                return [entry[0], entry[1].replace(/Guess36MinesClient\.tsx[^\n]*?,"default"/g, match => {
                  window.__oldExpeditionReferences++;
                  return match.replace(/"default"$/, '"Guess36MinesClient"');
                })];
              });
              return push.apply(this, transformed);
            },
            set: next => { push = next; },
          });
          window.__next_f = stream;
        });
      }
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && /element type is invalid|lazy element type|ChunkLoadError/i.test(message.text())) errors.push(message.text());
      });
      await page.goto(base + '/guess-36');
      await expectGame(page);
      const reloads = oldReference ? 1 : 4;
      for (let index = 0; index < reloads; index++) {
        await page.reload();
        await expectGame(page);
      }
      if (oldReference) assert.ok(await page.evaluate(() => window.__oldExpeditionReferences) > 0, 'older named reference was exercised');
      else {
        for (let index = 0; index < 3; index++) {
          await page.getByRole('link', { name: 'Back to Home', exact: true }).click();
          await page.waitForURL(base + '/');
          await page.goBack();
          await expectGame(page);
        }
      }
      console.log(`PASS ${oldReference ? 'earlier named reference' : 'current default reference'}: entry, ${reloads} reloads${oldReference ? '' : ', 3 Back returns'}`);
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('PASS no client-module errors or stuck loader');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
