// Uses the real Spin components against a loopback-only fixture; never consumes a daily reward.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('playwright');

async function bundle() {
  return build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'spin-browser-fixture.tsx', loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {DailySpinWidget} from './components/DailySpinWidget';
      import {useVaultDailyAction} from './components/rewards/useVaultDailyAction';
      import {VaultDailyActionModal} from './components/rewards/VaultDailyActionModal';
      window.fixture={commits:0}; Math.random=()=>0;
      const realFetch=window.fetch;
      window.fetch=async(...args)=>{const response=await realFetch(...args);
        if(args[1]?.method==='POST'){const json=response.json.bind(response);response.json=async()=>{const data=await json();window.fixture.responseAt=performance.now();return data;};}
        return response;};
      function Vault(){const daily=useVaultDailyAction('fixture-owner',()=>{window.fixture.commits++;});
        return <><button onClick={()=>daily.start('spin')}>Take daily spin</button>
        {daily.action&&<VaultDailyActionModal action={daily.action} close={daily.close} retry={()=>daily.start('spin',true)}/>}</>;}
      const root=createRoot(document.getElementById('root'));
      window.unmountSpin=()=>root.unmount();
      root.render(new URLSearchParams(location.search).get('view')==='vault'?<Vault/>:<DailySpinWidget/>);
      document.addEventListener('click',event=>{if(event.target.closest('button')?.textContent.match(/SPIN NOW|Take daily spin/))window.fixture.startAt=performance.now();},true);
      new MutationObserver(()=>{const cell=document.querySelector('.spin-cell-highlighted');
        if(cell?.textContent.includes('Confirmed reward')&&!window.fixture.landAt)window.fixture.landAt=performance.now();
        if(document.querySelector('.reward-reveal')&&!window.fixture.revealAt)window.fixture.revealAt=performance.now();
      }).observe(document.getElementById('root'),{subtree:true,childList:true,attributes:true});
    ` },
    bundle: true, platform: 'browser', format: 'iife', write: false, outdir: 'spin-memory-output',
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.module.css': 'local-css' },
    plugins: [{ name: 'signed-in-fixture', setup(b) {
      b.onResolve({ filter: /^next-auth\/react$/ }, () => ({ path: 'session', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: 'export const useSession=()=>({data:{user:{id:"fixture-owner"}},status:"authenticated"});' }));
    } }],
  });
}

(async () => {
  const built = await bundle();
  const script = built.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = built.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
  const globalCss = fs.readFileSync('app/globals.css', 'utf8').replace(/^@import[^\r\n]*[\r\n]*/gm, '');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'emiguild-spin-check-'));
  const requests = new Map();
  const reward = { id: 'reward-1', name: 'Confirmed reward', rarity: 'RARE' };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${globalCss}\n${css}</style><div id="root"></div><script>${script}</script>`);
      return;
    }
    if (url.pathname !== '/api/daily-spin') { response.statusCode = 404; response.end('{}'); return; }
    const referer = new URL(request.headers.referer);
    const key = referer.search;
    const count = requests.get(key) ?? { posts: 0 };
    requests.set(key, count);
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'POST') {
      count.posts++;
      await new Promise(resolve => setTimeout(resolve, Number(referer.searchParams.get('delay')) || 0));
      if (referer.searchParams.get('reject')) { response.statusCode = 429; response.end(JSON.stringify({ error: 'Fixture spin rejected' })); return; }
      response.end(JSON.stringify({ reward, streak: { current: 1, target: 10 }, streakReward: false }));
      return;
    }
    response.end(JSON.stringify({ enabled: true, canSpin: !count.posts, spinDate: '2026-11-12',
      nextReset: '2099-11-12T18:30:00Z', spin: count.posts ? { lootItem: reward } : null,
      lootItems: [{ id: 'other', name: 'Other reward' }, reward, { id: 'third', name: 'Third reward' }],
      streak: { current: count.posts ? 1 : 0, target: 10, guaranteedToday: false, spinsRemaining: 9 } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  try {
    const cases = [
      { view: 'page', width: 375, cpu: 4 }, { view: 'vault', width: 320 },
      { view: 'page', width: 430, delay: 4600 }, { view: 'vault', width: 375, delay: 4600 },
      { view: 'page', width: 375, reduced: true }, { view: 'vault', width: 375, reduced: true },
    ];
    for (const [index, scenario] of cases.entries()) {
      const page = await browser.newPage({ viewport: { width: scenario.width, height: 812 }, reducedMotion: scenario.reduced ? 'reduce' : 'no-preference' });
      page.on('pageerror', error => errors.push(error.message));
      if (scenario.cpu) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: scenario.cpu }); }
      const query = `?view=${scenario.view}&delay=${scenario.delay ?? 0}&case=${index}`;
      await page.goto(base + query);
      await page.getByRole('button', { name: scenario.view === 'vault' ? 'Take daily spin' : /SPIN NOW/ }).click();
      if (!scenario.reduced) {
        await page.waitForSelector('.spin-cell-highlighted');
        await page.waitForTimeout(350);
        const pulse = await page.locator('.spin-cell-highlighted').evaluate(cell => {
          const style = getComputedStyle(cell, '::after');
          return { name: style.animationName, duration: style.animationDuration, opacity: Number(style.opacity) };
        });
        assert.equal(pulse.name, 'spinHighlightPulse'); assert.equal(pulse.duration, '0.6s');
        assert.ok(pulse.opacity >= .35 && pulse.opacity <= .85);
        await page.waitForFunction(() => window.fixture.landAt);
        await page.waitForTimeout(300);
        assert.equal(await page.locator('.spin-cell-highlighted').evaluate(cell => getComputedStyle(cell, '::after').animationName), 'spinHighlightPulse');
      }
      await page.locator('.reward-reveal').waitFor({ timeout: 12000 });
      await page.waitForFunction(() => window.fixture.revealAt);
      const timing = await page.evaluate(() => window.fixture);
      assert.equal(await page.locator('.spin-cell-winner').count(), 1);
      assert.match(await page.locator('.spin-cell-winner').innerText(), /Confirmed reward/);
      assert.equal(requests.get(query).posts, 1);
      if (scenario.reduced) {
        assert.ok(timing.revealAt - timing.responseAt < 500);
        assert.equal(await page.locator('.spin-cell-winner').evaluate(cell => getComputedStyle(cell).animationName), 'none');
        assert.equal(await page.locator('.spin-cell-winner').evaluate(cell => {
          cell.classList.add('spin-cell-highlighted');
          const animation = getComputedStyle(cell, '::after').animationName;
          cell.classList.remove('spin-cell-highlighted');
          return animation;
        }), 'none');
      } else {
        assert.ok(timing.revealAt - timing.landAt >= 580);
        if (scenario.delay) assert.ok(timing.revealAt - timing.responseAt < 950, JSON.stringify(timing));
        else assert.ok(timing.revealAt - timing.startAt >= 4900 && timing.revealAt - timing.startAt < 7000, JSON.stringify(timing));
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (scenario.view === 'vault') assert.equal(timing.commits, 1);
      if (!scenario.reduced) await page.waitForTimeout(550);
      await page.screenshot({ path: path.join(output, `spin-${index}.png`), fullPage: true });
      console.log(`PASS ${scenario.view} ${scenario.width}px ${scenario.reduced ? 'reduced motion' : scenario.delay ? 'slow server' : scenario.cpu ? '4x CPU' : 'normal'}: ${Math.round(timing.revealAt - timing.startAt)}ms, one POST`);
      await page.close();
    }
    const rejected = await browser.newPage();
    rejected.on('pageerror', error => errors.push(error.message));
    await rejected.goto(base + '?view=page&reject=1');
    await rejected.getByRole('button', { name: /SPIN NOW/ }).click();
    await rejected.getByText('Fixture spin rejected', { exact: true }).waitFor();
    assert.equal(await rejected.locator('.spin-cell-highlighted,.reward-reveal').count(), 0);
    await rejected.close();
    assert.deepEqual(errors, []);
    console.log(`PASS rejected result, no runtime errors; screenshots: ${output}`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
