// Read-only component preview: mocked session and fetch, no app server or database.
const { build } = require('esbuild');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
(async () => {
  const out = mkdtempSync(path.join(tmpdir(), 'emiguild-happy-visual-'));
  const result = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {HappyTicketPanel} from './components/HappyTicketPanel';import {AdminHappyTickets} from './components/admin/AdminHappyTickets';createRoot(document.getElementById('root')).render(location.hash==='#admin'?<AdminHappyTickets/>:<HappyTicketPanel/>);`, resolveDir: process.cwd(), sourcefile: 'preview.tsx', loader: 'tsx' }, outfile: 'preview.js', bundle: true, write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'preview-only', setup(b) {
    b.onResolve({ filter: /^next-auth\/react$/ }, () => ({ path: 'session', namespace: 'mock' }));
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'session' ? `export const useSession=()=>({data:{user:{id:'preview-admin',role:'ADMIN'}},status:'authenticated'});` : `import React from 'react';export default function Link(props){return React.createElement('a',props)}`, loader: 'js', resolveDir: process.cwd() }));
  } }] });
  const js = result.outputFiles.find(f => f.path.endsWith('.js')).text;
  const css = result.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '';
  const browser = await chromium.launch({ headless: true, ...(process.env.NOVEMBER_BROWSER_EXECUTABLE ? { executablePath: process.env.NOVEMBER_BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const base = `<style>*{box-sizing:border-box}body{margin:0;background:#080c15;color:#f4f5fc;font-family:Arial,sans-serif;padding:16px}h1{font-size:1.6rem}h2{font-size:1.2rem}button,input,select,textarea{font:inherit}a{color:#b9a8ff}.btn{display:inline-flex;min-height:44px;align-items:center;padding:10px 14px;border:1px solid #536180;border-radius:8px;background:#24304c;color:white;cursor:pointer}.btn:disabled{opacity:.5}#root{max-width:1100px;margin:auto} ${css}</style><div id="root"></div>`;
    for (const admin of [false,true]) for (const width of [320,375,430,1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(base);
      await page.evaluate(admin => {
        location.hash = admin ? 'admin' : '';
        Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
        const config = { stationIds: ['ps5'], days: [1,2,3,4,5], startTime: '16:00', endTime: '23:00' };
        const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
        window.fetch = async () => Response.json(admin ? { pool: { available: 3, version: 1, config }, counts: { accounts: 10, available: 30, banked: 10, issued: 8, redeemed: 3, expired: 2 }, flags: { legendary_pity_30_enabled: true, tower_loss_rewards_enabled: true, happy_tickets_enabled: true, guild_resets_enabled: true }, stations: [{ id:'ps5', name:'PS5 Station 1' }], tickets: [{ id:'ticket', user:{ name:'Preview member with a longer name', email:'preview@example.test' }, claimedAt: new Date().toISOString(), expiresAt, status:'CLAIMED', redemptions:[] }], resets:[{grantId:'banked-preview',kind:'BANKED',counts:{PENDING:10},expired:false,status:'PENDING',reason:'Stored refill',createdAt:new Date().toISOString(),expiresAt}], events: [{id:'event',kind:'FORCE',before:0,after:5,createdAt:new Date().toISOString()}], nextCursor:null,members:[],member:null } : { pool:{ available:3, capacity:5, enabled:true, noEligibleWindow:false, serverNow:new Date().toISOString(), rules:config },wallet:{nextClaimAt:new Date(Date.now()+23*3_600_000+59*60_000).toISOString(),tickets:[{id:'ticket',status:'CLAIMED',expiresAt,redemptions:[]}]} });
      }, admin);
      await page.addScriptTag({ content: js });
      await page.getByRole('heading', { name: 'Happy Tickets', exact: true }).waitFor();
      if (!admin) await page.getByRole('button', { name: /Claimed/ }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}, admin=${admin}`);
      assert.equal(await page.getByRole('heading', { name: 'November updates' }).count(), 0);
      if (admin) {
        await page.getByLabel('Reason', { exact: true }).fill('Preview confirmation');
        await page.getByRole('button', { name: 'Refill everyone to five' }).click();
        await page.getByRole('dialog').waitFor();
        assert.equal(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), true);
        await page.getByRole('button', { name:'Back', exact:true }).click();
      } else {
        await page.getByRole('button', { name:'Refresh Happy Tickets' }).focus();
        assert.equal(await page.getByRole('button', { name:'Refresh Happy Tickets' }).evaluate(el => el === document.activeElement), true);
      }
      await page.screenshot({ path:path.join(out, `${admin?'admin':'happy'}-${width}.png`), fullPage:true });
    }
    assert.deepEqual(errors, []);
    console.log('Read-only visual/keyboard/reduced-motion checks passed:', out);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
