// Real popup and shared modal shell; all configuration changes stay inside the fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  const built = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import HomePopup from './components/HomePopup'; import {DEFAULT_HOME_POPUP} from './lib/home-popup';
      const root=createRoot(document.getElementById('root')); let config=DEFAULT_HOME_POPUP;
      window.updatePopup=patch=>{config={...config,...patch};root.render(<HomePopup config={config}/>);};
      window.updatePopup({});`, resolveDir: process.cwd(), sourcefile: 'popup-browser-fixture.tsx', loader: 'tsx' },
    bundle: true, platform: 'browser', format: 'iife', write: false, outdir: 'popup-memory-output', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.module.css': 'local-css' },
    plugins: [{ name: 'home-readiness-fixture', setup(b) {
      b.onLoad({ filter: /HomeLoadingBoundary\.tsx$/ }, () => ({ loader: 'js', contents: `
        import {useSyncExternalStore} from 'react';let revealed=true;const listeners=new Set();
        window.setHomeRevealed=next=>{revealed=next;listeners.forEach(listener=>listener());};
        const subscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
        export const useHomeRevealed=()=>useSyncExternalStore(subscribe,()=>revealed,()=>false);` }));
    } }],
  });
  const script = built.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = built.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
  const globalCss = fs.readFileSync('app/globals.css', 'utf8').replace(/^@import[^\r\n]*[\r\n]*/gm, '');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'emiguild-popup-check-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const setup = async viewport => {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<style>${globalCss}\n${css}</style><button id="behind">Behind popup</button><div id="root"></div>`);
    await page.locator('#behind').focus();
    await page.addScriptTag({ content: script });
    await page.getByRole('dialog').waitFor();
    return page;
  };
  try {
    for (const viewport of [{ width: 1280, height: 500 }, { width: 320, height: 568 }, { width: 375, height: 667 }]) {
      const page = await setup(viewport);
      assert.equal(await page.getByRole('dialog').evaluate(dialog => {
        const tops = Array.from(dialog.querySelectorAll('li')).map(tile => tile.getBoundingClientRect().top);
        return tops.length === 3 && tops.every(top => Math.abs(top - tops[0]) < 1);
      }), true, 'default prices retain their three-column layout');
      await page.evaluate(() => window.updatePopup({ title: 'Important announcement '.repeat(3).slice(0, 60),
        subtitle: 'Details for all gaming sessions and advance bookings. '.repeat(4).slice(0, 160),
        note: 'Please contact staff to confirm availability and times. '.repeat(4).slice(0, 160),
        prices: Array.from({ length: 6 }, (_, i) => ({ label: 'Advance session ' + (i + 1), amount: 100000 })) }));
      await page.waitForTimeout(50);
      assert.equal(await page.getByRole('dialog').evaluate(dialog => Array.from(dialog.querySelectorAll('li')).every(tile => {
        const bounds = tile.getBoundingClientRect();
        return Array.from(tile.querySelectorAll('span,strong')).every(text => {
          const content = text.getBoundingClientRect();
          return content.left >= bounds.left && content.right <= bounds.right && text.scrollWidth <= text.clientWidth;
        });
      })), true, 'all permitted price labels and amounts fit inside their tiles');
      const scrolling = await page.getByRole('dialog').evaluate(dialog => ({
        dialog: getComputedStyle(dialog).overflowY, overlay: getComputedStyle(dialog.parentElement).overflowY,
      }));
      assert.equal(viewport.width > 768 ? scrolling.dialog : scrolling.overlay, 'auto');
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      await page.mouse.wheel(0, 2000); await page.waitForTimeout(150);
      const action = page.getByRole('link', { name: 'Pre-book on WhatsApp' });
      const bounds = await action.boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height, JSON.stringify({ viewport, bounds }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(output, `popup-${viewport.width}.png`), fullPage: true });
      await page.keyboard.press('Tab');
      assert.equal(await page.getByRole('button', { name: 'Close announcement' }).evaluate(button => button === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await action.evaluate(link => link === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.getByRole('button', { name: 'Close announcement' }).evaluate(button => button === document.activeElement), true);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      assert.equal(await page.locator('#behind').evaluate(button => button === document.activeElement), true);
      assert.equal(await page.evaluate(() => document.body.style.position), '');
      console.log(`PASS ${viewport.width}x${viewport.height}: long content scrolls, keyboard wraps and focus restores`);
      await page.close();
    }

    const page = await setup({ width: 1280, height: 800 });
    await page.evaluate(() => window.updatePopup({ enabled: false }));
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.evaluate(() => window.updatePopup({ enabled: true }));
    await page.waitForTimeout(200); assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('dialog').waitFor();
    await page.evaluate(() => window.setHomeRevealed(false));
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.evaluate(() => window.setHomeRevealed(true));
    await page.waitForTimeout(200); assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Close announcement' }).click();
    await page.evaluate(() => window.updatePopup({ enabled: false }));
    await page.evaluate(() => window.updatePopup({ enabled: true }));
    await page.waitForTimeout(500); assert.equal(await page.getByRole('dialog').count(), 0);
    await page.close();
    assert.deepEqual(errors, []);
    console.log(`PASS disable/re-enable, readiness gating and manual dismissal; no runtime errors; screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
