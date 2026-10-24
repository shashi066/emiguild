/* Browser checks for the actual Fusion UI with mocked API. Requires local playwright and esbuild. */
const { build } = require('esbuild');
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'emiguild-collection-'));
  const root = process.cwd();
  let entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {LuckyFusion} from './components/LuckyFusion';
  const ids=['iron_vanguard','silver_phantom','golden_titan','platinum_sovereign'];const tiers=['BRONZE','SILVER','GOLD','PLATINUM'];const slots=['HEADGEAR','ARMOR','GLOVES','BOOTS'];
  const sets=ids.map((id,i)=>({id,name:id.replaceAll('_',' '),rarity:tiers[i]}));
  const artifacts=sets.flatMap(set=>slots.map(slot=>({id:set.id+'_'+slot.toLowerCase(),name:set.name+' '+slot,setId:set.id,slotType:slot,active:true,set:{...set,active:true}})));
  const state={sets,artifacts,inventory:artifacts.map(artifact=>({artifactId:artifact.id,quantity:4,artifact})),loadout:{HEADGEAR:artifacts[0],ARMOR:artifacts[5],GLOVES:artifacts[10],BOOTS:artifacts[15]},collection:{pinnedSetId:ids[0],discoveries:artifacts.map(a=>({artifactId:a.id})),completedSets:sets.map(s=>({setId:s.id}))},fusion:{enabled:true}};
  if(location.search.includes('empty'))state.inventory=[]; if(location.search.includes('long'))artifacts[0].name='Iron Vanguard Ancient Guardian Ceremonial Headgear With Reinforced Armor';
  function App(){const[busy,setBusy]=React.useState(false);return <LuckyFusion state={state} userId="preview" busy={busy} onBusy={setBusy} refresh={async()=>{}}/>};createRoot(document.getElementById('root')).render(<App/>);`;
  if (process.env.FULL_ARMORY) {
    entry = entry.replace("import {LuckyFusion} from './components/LuckyFusion';", "import {ArmoryClient} from './components/ArmoryClient'; import './app/globals.css';");
    entry = entry.slice(0, entry.indexOf('function App()')) + `state.forge={enabled:true,canForge:false,claimedToday:true,reason:'claimed',nextResetAt:new Date(Date.now()+3600000).toISOString()};state.serverNow=new Date().toISOString();state.progress={completeSet:null,reward:null};state.tickets=[];state.guildGems=4;window.__fixture=state;createRoot(document.getElementById('root')).render(<ArmoryClient initialState={state}/>);`;
  }
  const mocks = { name: 'preview-mocks', setup(build) {
    build.onResolve({filter:/^(next-auth\/react|next\/link)$/},args=>({path:args.path,namespace:'preview'}));
    build.onLoad({filter:/.*/,namespace:'preview'},args=>({contents:args.path==='next-auth/react' ? 'export const useSession=()=>({status:"authenticated",data:{user:{id:"preview"}}});' : 'import React from "react";export default function Link(props){return React.createElement("a",props)}',loader:'js',resolveDir:root}));
  }};
  await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, plugins: [mocks], outfile: path.join(dir, 'app.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({error:'Visual preview only. Reward actions do not affect real accounts.',definitive:true})); return; }
      if (req.url.split('?')[0] === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#080b14;font-family:Arial}#root{max-width:1100px;margin:auto}</style><div id="root"></div><script src="/app.js"></script>'); return; }
      const source = req.url.startsWith('/images/') ? path.join(root, 'public', req.url) : path.join(dir, req.url);
      res.setHeader('Content-Type', req.url.endsWith('.svg') ? 'image/svg+xml' : req.url.endsWith('.css') ? 'text/css' : 'application/javascript'); res.end(await fs.readFile(source));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(process.env.PREVIEW_ONLY ? 8767 : 0, '127.0.0.1', resolve));
  if (process.env.PREVIEW_ONLY) { console.log(`Artifacts visual preview: http://127.0.0.1:${server.address().port}`); return; }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const url = `http://127.0.0.1:${server.address().port}`;
    let postCount = 0, receipt = null;
    await page.route('**/api/armory/fusion**', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { receipt } });
      postCount++; receipt = { output: { name: 'Recovered Helm', rarity: 'SILVER' } };
      await route.abort('failed'); // Server committed, response lost.
    });
    await page.route('**/api/armory', async route => route.fulfill({ json: await page.evaluate(() => window.__fixture) }));
    await page.goto(url);
    for (const width of [320, 375, 430, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
      await page.screenshot({ path: path.join(dir, `collection-${width}.png`), fullPage: true });
    }
    assert.equal(await page.getByRole('tab', { name: 'Collection', exact: true }).count(), 0);
    assert.equal(await page.getByText('Your legacy.', { exact: true }).count(), 0);
    assert.equal(await page.getByLabel('Track a set').count(), 0);
    await page.getByRole('button', { name: 'Lucky Fusion', exact: true }).click();
    for (const width of [320,375,430,1440]) {
      await page.setViewportSize({width,height:740});
      const modal = page.getByRole('dialog', {name:'Lucky Fusion',exact:true});
      assert.ok(await modal.evaluate(el => el.scrollWidth <= el.clientWidth), `popup overflow at ${width}`);
      await page.screenshot({path:path.join(dir, `fusion-${width}.png`)});
    }
    for(let i=0;i<3;i++) await page.getByRole('button',{name:'Add iron vanguard HEADGEAR',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Add iron vanguard HEADGEAR',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Remove iron vanguard HEADGEAR, ingredient 2',exact:true}).click();
    await page.getByRole('button',{name:'Add iron vanguard ARMOR',exact:true}).click();
    await page.getByRole('button', { name: 'Review', exact:true }).click();
    assert.equal(await page.locator('dialog[open]').count(), 1);
    await page.getByRole('heading', {name:'Ready to fuse?'}).waitFor();
    await page.getByRole('button', {name:'Back',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/Remove iron vanguard/}).count(),3);
    await page.getByRole('button', {name:'Review',exact:true}).click();
    await page.getByRole('button', { name: 'Fuse', exact: true }).click();
    await page.getByRole('button', { name: 'Check result',exact:true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Recover fusion', exact: true }).click();
    await page.getByRole('button', { name: 'Check result',exact:true }).click();
    await page.getByRole('heading',{name:'Recovered Helm',exact:true}).waitFor();
    await page.getByRole('button',{name:'Done',exact:true}).click();
    assert.equal(postCount, 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('emiguild-fusion-v1:preview')), null);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.getByRole('button', { name: 'Lucky Fusion', exact: true }).evaluate(el => el === document.activeElement), true);
    const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.getByRole('button', { name: 'Lucky Fusion', exact: true }).click();
    await page.getByRole('group',{name:'Ingredient tier'}).getByRole('button',{name:'Platinum',exact:true}).click();
    for(let i=0;i<3;i++) await page.getByRole('button',{name:'Add platinum sovereign HEADGEAR',exact:true}).click();
    assert.equal(await page.getByRole('button', { name: 'Review', exact:true }).isDisabled(), true);
    await page.getByRole('button',{name:'Choose result',exact:true}).click();
    await page.getByRole('button',{name:'platinum sovereign BOOTS',exact:true}).click();
    assert.equal(await page.getByRole('button', { name: 'Review', exact:true }).isEnabled(), true);
    await page.setViewportSize({width:320,height:740});
    assert.ok(await page.locator('dialog[open]').evaluate(el => el.scrollWidth <= el.clientWidth), 'popup horizontal overflow');
    await page.goto(url+'?empty');
    await page.getByRole('button', {name:'Lucky Fusion',exact:true}).click();
    await page.getByText('No spare bronze items.', {exact:false}).waitFor();
    assert.equal(await page.getByRole('button', {name:'Review',exact:true}).isDisabled(),true);
    await page.goto(url+'?long');
    await page.getByRole('button', {name:'Lucky Fusion',exact:true}).click();
    assert.ok(await page.locator('dialog[open]').evaluate(el => el.scrollWidth <= el.clientWidth));
    for(let i=0;i<3;i++) await page.getByRole('button',{name:'Add Iron Vanguard Ancient Guardian Ceremonial Headgear With Reinforced Armor',exact:true}).click();
    await page.getByRole('button', {name:'Review',exact:true}).click();
    await page.screenshot({path:path.join(dir,'fusion-confirm-mobile.png')});
    assert.deepEqual(errors, []);
    console.log(`Browser checks passed. Screenshots: ${dir}`);
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
