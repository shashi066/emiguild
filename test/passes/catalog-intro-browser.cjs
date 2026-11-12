// Real Next.js server/client layouts with deterministic pages and no database access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { build } = require('esbuild');
const Module = require('node:module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require('playwright');

(async () => {
  const root = process.cwd();
  fs.mkdirSync(path.join(root, 'out'), { recursive: true });
  const fixture = fs.mkdtempSync(path.join(root, 'out', 'catalog-intro-'));
  const write = (file, content) => {
    const target = path.join(fixture, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  for (const file of ['tsconfig.json', 'components/TimedIntroBoundary.tsx', 'components/GamesLoader.tsx',
    'components/PassesLoader.tsx', 'components/games-loader.module.css', 'components/passes-loader.module.css',
    'app/games/layout.tsx', 'app/games/loading.tsx', 'app/passes/layout.tsx', 'app/passes/loading.tsx']) {
    write(file, fs.readFileSync(path.join(root, file), 'utf8'));
  }
  write('package.json', JSON.stringify({ name: 'catalog-intro-fixture', private: true,
    dependencies: { next: require('next/package.json').version, react: require('react/package.json').version,
      'react-dom': require('react-dom/package.json').version } }));
  write('next.config.mjs', `export default {devIndicators:false,outputFileTracingRoot:${JSON.stringify(fixture)}};`);
  write('app/globals.css', fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').replace(/^@import[^\r\n]*[\r\n]*/gm, ''));
  write('app/layout.tsx', `import Link from 'next/link';import './globals.css';
    export default function Layout({children}:{children:React.ReactNode}){return <html><body>
      <nav><Link href="/games">Games</Link> <Link href="/passes">Passes</Link></nav>{children}</body></html>;}`);
  for (const [route, title] of [['games', 'Games ready'], ['passes', 'Passes ready']]) {
    write(`app/${route}/page.tsx`, `export default async function Page({searchParams}:{searchParams:Promise<{delay?:string}>}){
      const query=await searchParams;if(query.delay)await new Promise(resolve=>setTimeout(resolve,Number(query.delay)));
      return <main><h1>${title}</h1><button>Catalogue action</button></main>;}`);
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
  const reserve = http.createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  let logs = '';
  const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack',
    '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: fixture, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  let browser;
  const errors = [];
  try {
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => { clearInterval(poll); reject(Error('Next fixture startup timed out: ' + logs)); }, 30000);
      const poll = setInterval(() => {
        if (/Ready in/.test(logs)) { clearTimeout(deadline); clearInterval(poll); resolve(); }
        else if (server.exitCode !== null) { clearTimeout(deadline); clearInterval(poll); reject(Error(logs)); }
      }, 100);
    });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const base = `http://127.0.0.1:${port}`;
    for (const [route, title] of [['games', 'Games ready'], ['passes', 'Passes ready']]) {
      const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.__introTimers = [];
        const schedule = window.setTimeout.bind(window);
        window.setTimeout = (callback, delay, ...args) => {
          if (new Error().stack.includes('TimedIntroBoundary')) window.__introTimers.push({ delay: Number(delay), at: performance.now() });
          return schedule(callback, delay, ...args);
        };
      });
      await page.goto(base + '/' + route, { waitUntil: 'commit', timeout: 60000 });
      await page.locator('[data-catalog-intro-loader]').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Catalogue action' }).isVisible(), false);
      await page.getByRole('heading', { name: title }).waitFor({ timeout: 15000 });
      const timing = await page.evaluate(() => ({ waits: window.__introTimers, now: performance.now() }));
      assert.equal(timing.waits.at(-1).delay, 1500);
      assert.ok(timing.now - timing.waits.at(-1).at >= 1450, JSON.stringify(timing));
      assert.equal(await page.locator('[data-catalog-intro-content]').getAttribute('inert'), null);
      assert.equal(await page.getByRole('button', { name: 'Catalogue action' }).isEnabled(), true);
      assert.equal(await page.locator('[data-catalog-intro-loader]').count(), 0);
      console.log(`PASS real Next.js ${route}: entry, server/client duration prop and interactive content`);
      await page.getByRole('link', { name: route === 'games' ? 'Passes' : 'Games', exact: true }).click();
      await page.getByRole('heading', { name: route === 'games' ? 'Passes ready' : 'Games ready' }).waitFor();
      await page.goBack();
      await page.getByRole('heading', { name: title }).waitFor();
      console.log(`PASS ${route}: internal navigation and browser Back`);
      await page.close();

      const reduced = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' });
      reduced.on('pageerror', error => errors.push(error.message));
      await reduced.goto(base + '/' + route + '?delay=2400', { waitUntil: 'commit' });
      await reduced.locator('[data-catalog-intro-loader]').waitFor();
      assert.equal(await reduced.locator('[data-catalog-intro-loader] svg').evaluate(svg => svg.getAnimations({ subtree: true }).length), 0);
      await reduced.getByRole('heading', { name: title }).waitFor();
      assert.equal(await reduced.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      console.log(`PASS ${route}: slow server and reduced motion at 320px`);
      await reduced.close();

    }

    // Check the component's SSR fallback independently of Next's JS-dependent streamed route slots.
    const bundled = await build({ entryPoints: ['components/TimedIntroBoundary.tsx'], bundle: true,
      platform: 'node', format: 'cjs', packages: 'external', write: false, jsx: 'automatic' });
    const filename = path.join(root, 'catalog-ssr-memory-fixture.cjs');
    const mod = new Module(filename, module); mod.filename = filename; mod.paths = module.paths;
    mod._compile(bundled.outputFiles[0].text, filename);
    const markup = renderToStaticMarkup(React.createElement(mod.exports.TimedIntroBoundary,
      { durationMs: 1500, loader: React.createElement('p', null, 'Loading catalogue') },
      React.createElement('main', null, React.createElement('h1', null, 'Server catalogue ready'),
        React.createElement('button', null, 'Catalogue action'))));
    const noScript = await browser.newPage({ javaScriptEnabled: false });
    await noScript.setContent(markup);
    await noScript.getByRole('heading', { name: 'Server catalogue ready' }).waitFor();
    assert.equal(await noScript.locator('[data-catalog-intro-content]').getAttribute('inert'), null);
    assert.equal(await noScript.locator('[data-catalog-intro-loader]').isVisible(), false);
    await noScript.keyboard.press('Tab');
    assert.equal(await noScript.getByRole('button', { name: 'Catalogue action' }).evaluate(button => button === document.activeElement), true);
    await noScript.close();
    console.log('PASS intro SSR fallback: rendered content is visible and focusable without JavaScript');
    assert.deepEqual(errors, []);
    console.log(`PASS no runtime/hydration errors; fixture: ${fixture}`);
  } catch (error) {
    console.error(logs.slice(-8000));
    throw error;
  } finally {
    if (browser) await browser.close();
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else server.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
