// Actual Chrome + Auth.js + real reward transactions, disposable database only.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { traceExpedition } = require('./browser-trace.cjs');
const url = process.env.DATABASE_URL ?? '';
if(url !== process.env.MINES_TEST_DATABASE_URL || !url.startsWith('file:') || !url.includes('mines-test')) throw Error('Use an explicitly supplied disposable Mines SQLite database.');
const port = Number(process.env.MINES_BROWSER_PORT ?? 3016);
if(!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000) throw Error('Choose a separate local test port.');
const base = `http://127.0.0.1:${port}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'guild-expedition-ui-'));
const compiledApp = process.env.MINES_BROWSER_COMPILED_APP === 'true';
// Keep the isolated source tree outside the repo so tsc/build do not scan fixtures.
// Use the same drive: webpack cannot resolve Windows cross-drive source paths.
const workspace = compiledApp ? process.cwd() : fs.mkdtempSync(path.join(path.dirname(process.cwd()),'.emiguild-mines-test-browser-'));
if(!compiledApp) {
for(const name of ['app','components','lib','types']) {
 const target=path.join(process.cwd(),name);if(fs.existsSync(target))fs.cpSync(target,path.join(workspace,name),{recursive:true});
}
for(const name of ['public','node_modules']) {
 fs.symlinkSync(path.join(process.cwd(),name),path.join(workspace,name),'junction');
}
for(const item of fs.readdirSync(process.cwd(),{withFileTypes:true})) {
 if(item.isFile() && /\.(ts|tsx|json|mjs)$/.test(item.name) && !item.name.startsWith('.env')) fs.copyFileSync(path.join(process.cwd(),item.name),path.join(workspace,item.name));
}
}

const log = fs.openSync(path.join(dir,'server.log'),'a');
const prisma = new PrismaClient();
const password = `Fixture-${randomUUID()}`;
const today = () => new Date(Date.now()+19800000).toISOString().slice(0,10);
const board = [...Array(5).fill('GREEN'),...Array(5).fill('RED'),...Array(26).fill('YELLOW')];
let browser, server, rules;let tracedPages=0;const traceSaves=[];
const checks=[];const errors=[];
function ok(name) {checks.push(name);console.log('PASS '+name);}
const serverCode = `const next=require('next');const http=require('node:http');(async()=>{const config=(await import('./next.config.mjs')).default;const app=next({dev:true,webpack:true,dir:process.cwd(),hostname:'127.0.0.1',port:${port},conf:config});await app.prepare();const handle=app.getRequestHandler();const server=http.createServer((req,res)=>handle(req,res));server.on('upgrade',app.getUpgradeHandler());server.listen(${port},'127.0.0.1',()=>process.send('ready'));let closing=false;process.on('message',async message=>{if(message==='close'&&!closing){closing=true;server.closeAllConnections();await app.close();server.close(()=>process.exit(0));}});})().catch(e=>{console.error(e);process.exit(1)});`;
async function login(context,user) {
 const csrf=await(await context.request.get(base+'/api/auth/csrf')).json();
 await context.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,email:user.email,password,callbackUrl:base},headers:{origin:base}});
 const session=await(await context.request.get(base+'/api/auth/session')).json();assert.equal(session.user?.id,user.id);
}
async function member(seed,viewport={width:375,height:812},reduced=false) {
 const user=await prisma.user.create({data:{name:'Expedition browser fixture',email:`expedition-${randomUUID()}@example.test`,password:await bcrypt.hash(password,4)}});
 let entry;
 if(seed) {
  const round=await prisma.guess36Round.upsert({where:{roundDate:today()},create:{roundDate:today(),minesSnapshot:JSON.stringify(rules)},update:{}});
  const revealed=seed.revealed??[];const status=seed.status??'ACTIVE';
  const reward=seed.reward??(status==='ACTIVE'||status==='LOST'?null:rules.rewards[revealed.filter(i=>board[i]==='GREEN').length-1]);
  entry=await prisma.guess36Entry.create({data:{roundId:round.id,userId:user.id,gameMode:'MINES',selectionType:null,mineBoard:JSON.stringify(board),mineRevealed:JSON.stringify(revealed),mineStatus:status,mineRules:JSON.stringify(rules),mineStartedAt:new Date(),mineExpiresAt:new Date(Date.now()+(seed.seconds??90)*1000),mineVersion:revealed.length,mineReward:reward?JSON.stringify(reward):null,mineSettledAt:status==='ACTIVE'?null:new Date()}});
  if(seed.ticket)await prisma.armoryTicket.create({data:{userId:user.id,source:'GUESS_36',sourceRefId:entry.id,code:`UI-${randomUUID()}`,rewardSnapshot:JSON.stringify({reward}),expiresAt:new Date(Date.now()+(seed.expired?-1000:86400000)),status:seed.ticket,claimDate:today()}});
 }
 const context=await browser.newContext({viewport,reducedMotion:reduced?'reduce':'no-preference'});await context.addInitScript(()=>{window.__brandLoaderSeen=false;new MutationObserver(()=>{if([...document.querySelectorAll('p[role="status"]')].some(el=>el.textContent.includes('Loading Guess 36')))window.__brandLoaderSeen=true;}).observe(document,{childList:true,subtree:true});});await login(context,user);
 const page=await context.newPage();const saveTrace=await traceExpedition(page,dir,`game-${++tracedPages}`);traceSaves.push(saveTrace);page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error'&&/element type is invalid|lazy element type|ChunkLoadError/i.test(message.text()))errors.push(message.text());});
 // Terminal fixtures exercise explicit recovery, matching the production contract.
 if(entry && entry.mineStatus!=='ACTIVE') await page.route('**/api/guess-36/current',route=>route.continue({url:base+'/api/guess-36/current?recover='+entry.id}));
 let documents=0,reads=0,posts=0;
 page.on('request',r=>{if(r.isNavigationRequest()&&r.resourceType()==='document')documents++;if(r.url().includes('/api/guess-36/current'))reads++;if(r.method()==='POST'&&/guess-36\/(reveal|collect)/.test(r.url()))posts++;});
 const entryCheck=page.waitForResponse(response=>response.url().includes('/api/guess-36/current'));
 await page.goto(base+'/guess-36');await page.getByRole('heading',{name:'Guild Expedition',exact:true}).waitFor({state:'visible',timeout:30000});await entryCheck;await page.waitForFunction(()=>!document.querySelector('[aria-label="Refresh Guild Expedition"]').disabled);
 if(seed)assert.equal(await page.evaluate(()=>window.__brandLoaderSeen),false,'recovery must skip the branded loader');
 const close=context.close.bind(context);context.close=async()=>{await saveTrace();await close();};
 return {user,entry,context,page,counts:()=>({documents,reads,posts})};
}
const tile=(page,index,label='hidden')=>page.getByRole('button',{name:`Tile ${index+1}${label==='hidden'?', hidden':': '+label}`,exact:true});
async function commitThenDrop(route, context) {
 // Forward once with this device's real session, then drop only the browser response.
 // A separate request context avoids route.fetch keep-alive resets in Chrome.
 try {
  const response=await context.request.post(route.request().url(),{data:route.request().postDataJSON(),headers:{origin:base}});
  assert.equal(response.status(),200);
 } catch(error) { errors.push(`Interrupted-response fixture failed: ${error.message}`); }
 finally { await route.abort('failed').catch(()=>{}); }
}
async function noReload(game,action) {
 const before=game.counts();
 await game.page.evaluate(()=>window.__expeditionRoot=document.querySelector('[aria-label="Guess 36 Guild Expedition"]'));
 await action();
 assert.equal(game.counts().documents,before.documents);
 assert.equal(await game.page.evaluate(()=>window.__expeditionRoot===document.querySelector('[aria-label="Guess 36 Guild Expedition"]')&&window.__expeditionRoot.isConnected),true);
 assert.equal(await game.page.getByText(/Loading Guess 36/).count(),0);
}
async function infoCheck(game,kind='got') {
 const before=game.counts();await game.page.getByRole('button',{name:'Guild Expedition rules',exact:true}).click();
 const dialog=game.page.getByRole('dialog');await dialog.waitFor({state:'visible'});const bounds=await dialog.boundingBox();const width=game.page.viewportSize().width;assert.ok(bounds.x>=15&&bounds.x+bounds.width<=width-15,JSON.stringify({bounds,width}));
 const scroll=await game.page.evaluate(()=>document.body.style.position==='fixed'?-parseFloat(document.body.style.top||'0'):scrollY);
 await game.page.keyboard.press('Tab');assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
 if(kind==='escape')await game.page.keyboard.press('Escape');else if(kind==='close')await game.page.getByRole('button',{name:'Close Guess 36',exact:true}).click();else await game.page.getByRole('button',{name:'Got It',exact:true}).click();
 await dialog.waitFor({state:'hidden'});await game.page.waitForTimeout(200);assert.equal(game.counts().reads,before.reads);assert.equal(game.counts().documents,before.documents);
 assert.ok(Math.abs(await game.page.evaluate(()=>scrollY)-scroll)<2,'Info restores document scroll');
 assert.equal(await game.page.getByRole('button',{name:'Guild Expedition rules',exact:true}).evaluate(el=>el===document.activeElement),true);
}
async function finishWithInfo(game,endpoint,action,result) {
 let release,committed;const ready=new Promise(resolve=>committed=resolve);const response=new Promise(resolve=>release=resolve);
 await game.page.route(`**/api/guess-36/${endpoint}`,async route=>{const actual=await route.fetch();committed();await response;await route.fulfill({response:actual});});
 await action();await ready;await game.page.getByRole('button',{name:'Guild Expedition rules'}).click();
 const modal=game.page.getByRole('dialog');await modal.waitFor();await modal.evaluate(el=>el.scrollTop=80);const scroll=await modal.evaluate(el=>el.scrollTop);
 await noReload(game,async()=>{release();await result.waitFor({state:'attached'});});assert.equal(await modal.isVisible(),true);assert.equal(await modal.evaluate(el=>el.scrollTop),scroll);
 await game.page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
}
(async()=>{
 try {
  await prisma.setting.upsert({where:{key:'guess_36_mines_enabled'},create:{key:'guess_36_mines_enabled',value:'true'},update:{value:'true'}});
  if(compiledApp) {
   // Same guarded disposable database and loopback-only port as the dev fixture.
   // Start the already-compiled app solely for this test and stop it in finally.
   server=spawn(process.execPath,[path.join(process.cwd(),'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:workspace,windowsHide:true,env:{...process.env,NODE_ENV:'production',AUTH_SECRET:randomUUID(),AUTH_URL:base,NEXTAUTH_URL:base,AUTH_TRUST_HOST:'true'},stdio:['ignore',log,log]});
   const started=Date.now();while(true){if(server.exitCode!==null)throw Error('Compiled test app exited '+server.exitCode);try{if((await fetch(base+'/api/auth/csrf')).ok)break;}catch{}if(Date.now()-started>30000)throw Error('Compiled test app did not start');await new Promise(resolve=>setTimeout(resolve,250));}
  } else {
  const serverFile=path.join(workspace,'fixture-server.cjs');fs.writeFileSync(serverFile,serverCode);
  server=spawn(process.execPath,[serverFile],{cwd:workspace,windowsHide:true,env:{...process.env,NODE_ENV:'development',AUTH_SECRET:randomUUID(),AUTH_URL:base,NEXTAUTH_URL:base,AUTH_TRUST_HOST:'true'},stdio:['ignore',log,log,'ipc']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Test server startup timed out; see '+dir)),60000);server.once('error',reject);server.once('exit',code=>{clearTimeout(timer);reject(Error('Test server exited '+code));});server.on('message',message=>{if(message==='ready'){clearTimeout(timer);resolve();}});});
  }
  browser=await chromium.launch({channel:'chrome',headless:true});
  const anonymous=await browser.newContext();const anon=await anonymous.newPage();anon.on('pageerror',e=>errors.push(e.message));await anon.goto(base+'/guess-36');await anon.getByRole('link',{name:'Sign in to play'}).waitFor({state:'visible'});assert.equal(await anon.getByRole('button',{name:/^Tile /}).count(),0);rules=await(await anonymous.request.get(base+'/api/guess-36/current')).json().then(s=>s.rules);await anonymous.close();ok('actual signed-out page hides board');
  if(process.env.REWARD_UPDATES_BROWSER_ONLY!=='true') {
  if(process.env.MINES_BROWSER_RECOVERY_ONLY!=='true') {
  for(let index=0;index<3;index++) {
   const user=await prisma.user.create({data:{name:'Expedition login fixture',role:index===1?'ADMIN':'USER',email:`expedition-login-${randomUUID()}@example.test`,password:await bcrypt.hash(password,4)}});
   if(index===2){
    const round=await prisma.guess36Round.upsert({where:{roundDate:today()},create:{roundDate:today(),minesSnapshot:JSON.stringify(rules)},update:{}});
    const entry=await prisma.guess36Entry.create({data:{roundId:round.id,userId:user.id,gameMode:'MINES',selectionType:null,mineBoard:JSON.stringify(board),mineRevealed:'[0]',mineStatus:'COLLECTED',mineRules:JSON.stringify(rules),mineStartedAt:new Date(),mineExpiresAt:new Date(Date.now()+90000),mineReward:JSON.stringify(rules.rewards[0]),mineSettledAt:new Date()}});
    await prisma.armoryTicket.create({data:{userId:user.id,source:'GUESS_36',sourceRefId:entry.id,code:`LOGIN-${randomUUID()}`,rewardSnapshot:JSON.stringify({reward:rules.rewards[0]}),expiresAt:new Date(Date.now()+86400000),claimDate:today()}});
   }
   const context=await browser.newContext({viewport:{width:375,height:812}});const page=await context.newPage();
   let documents=0;page.on('request',request=>{if(request.isNavigationRequest()&&request.resourceType()==='document')documents++;});
   page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error'&&/element type is invalid|lazy element type|ChunkLoadError/i.test(message.text()))errors.push(message.text());});
   await page.goto(base+'/guess-36');await page.getByRole('link',{name:'Sign in to play'}).click();await page.locator('#login-email').fill(user.email);
   if(index===0){await page.locator('#login-password').fill('incorrect-fixture-password');await page.locator('#login-submit-btn').click();await page.getByText('Invalid email or password. Please try again.',{exact:true}).waitFor();assert.ok(page.url().includes('/login'));}
   await page.locator('#login-password').fill(password);const beforeLogin=documents;await page.locator('#login-submit-btn').click();
   await page.waitForURL(base+'/guess-36');await page.getByRole('heading',{name:'Guild Expedition',exact:true}).waitFor({state:'visible',timeout:30000});assert.equal(await page.getByRole('button',{name:/^Tile /}).count(),36);
   assert.equal(documents,beforeLogin+1,'login makes exactly one fresh document navigation');
   if(index===2)await page.getByRole('article',{name:'Gaming Time: 15 min',exact:true}).waitFor();
   await page.reload();await page.getByRole('heading',{name:'Guild Expedition',exact:true}).waitFor({state:'visible',timeout:30000});assert.equal(await page.getByRole('button',{name:/^Tile /}).count(),36);
   await context.close();ok(`actual login-form return and authenticated reload ${index+1}`);
  }
  if(process.env.MINES_BROWSER_LOGIN_ONLY==='true'){assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:checks.length,errors,output:dir,realLoginForm:true}));return;}
  for(const width of [320,375,430,1280]) {
   const game=await member(null,{width,height:900});assert.equal(await game.page.getByRole('button',{name:/^Tile /}).count(),36);
   assert.equal(await game.page.locator('button[aria-label^="Tile "] svg').count(),0);assert.equal(await game.page.getByText('Recent runs & legacy results').count(),0);
   assert.equal(await game.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const box=await tile(game.page,0).boundingBox();assert.ok(box.width>=43&&box.height>=44,JSON.stringify(box));
   await infoCheck(game,'escape');await game.page.screenshot({path:path.join(dir,`layout-${width}.png`),fullPage:true});
   if(width===375) {
    await game.page.getByRole('button',{name:'Start free daily run',exact:true}).click();const before=game.counts();
    await noReload(game,async()=>{await tile(game.page,0).click();await game.page.getByRole('button',{name:/^Tile 1:/}).waitFor();});
    assert.equal(game.counts().posts,before.posts+1);assert.equal(await prisma.guess36Entry.count({where:{userId:game.user.id}}),1);
   }
   await game.context.close();ok(`real authenticated layout ${width}px, keyboard Info, touch targets`);
  }
  const collect=await member({});const collectReads=collect.counts().reads;
  await noReload(collect,async()=>{await tile(collect.page,0).evaluate(el=>{el.click();el.click();});await tile(collect.page,0,'loot').waitFor();await tile(collect.page,10).click();await tile(collect.page,10,'clear').waitFor();});assert.equal(collect.counts().posts,2);assert.equal(collect.counts().reads,collectReads);
  await infoCheck(collect,'close');await finishWithInfo(collect,'collect',()=>collect.page.getByRole('button',{name:'Collect 15 min',exact:true}).click(),collect.page.getByRole('article',{name:'Gaming Time: 15 min',exact:true}));
  assert.equal(collect.counts().reads,collectReads,'confirmed collection does not refetch state');assert.equal(await collect.page.getByRole('article',{name:'Gaming Time: 15 min',exact:true}).count(),1);assert.equal(await prisma.armoryTicket.count({where:{sourceRefId:collect.entry.id}}),1);await infoCheck(collect);await collect.page.screenshot({path:path.join(dir,'collected-ticket-375.png'),fullPage:true});await collect.context.close();ok('real collect, duplicate-tap protection, immediate shared ticket, no remount/reload');
  const loss=await member({revealed:[0]},{width:375,height:500});let release;let committed;
  const commitReady=new Promise(resolve=>committed=resolve);const allowResponse=new Promise(resolve=>release=resolve);
  await loss.page.route('**/api/guess-36/reveal',async route=>{const result=await route.fetch();committed();await allowResponse;await route.fulfill({response:result});});
  await tile(loss.page,5).click();await commitReady;await loss.page.getByRole('button',{name:'Guild Expedition rules'}).click();
  const modal=loss.page.getByRole('dialog');await modal.waitFor();await modal.evaluate(el=>el.scrollTop=80);const scroll=await modal.evaluate(el=>el.scrollTop);assert.ok(scroll>0,'short-phone guide is actually scrolled');
  await noReload(loss,async()=>{release();await loss.page.getByText('Game Over',{exact:true}).waitFor({state:'attached'});});assert.equal(await modal.isVisible(),true);assert.equal(await modal.evaluate(el=>el.scrollTop),scroll);await loss.page.screenshot({path:path.join(dir,'info-after-loss-375.png')});
  await loss.page.keyboard.press('Escape');await tile(loss.page,5,'k.o.').waitFor();await infoCheck(loss);await loss.context.close();ok('real red loss while Info is open preserves modal scroll and page');
  const bronze=await member({revealed:[0,1,2,3]},undefined,true);
  await finishWithInfo(bronze,'reveal',()=>tile(bronze.page,4).click(),bronze.page.getByRole('article',{name:'Bronze Pass: 10 hours',exact:true}));await infoCheck(bronze);assert.equal(await tile(bronze.page,4,'loot').evaluate(el=>getComputedStyle(el).animationName),'none');await bronze.page.screenshot({path:path.join(dir,'bronze-ticket-375.png'),fullPage:true});await bronze.context.close();ok('real fifth green, Bronze ticket, reduced motion and Info');
  const timeout=await member({revealed:[0],seconds:12});await timeout.page.getByRole('button',{name:'Guild Expedition rules'}).click();const timeoutReads=timeout.counts().reads;
  await noReload(timeout,async()=>{await timeout.page.getByText('Time is up',{exact:true}).waitFor({state:'attached',timeout:20000});});assert.equal(await timeout.page.getByRole('dialog').isVisible(),true);assert.equal(timeout.counts().reads,timeoutReads+1);await timeout.page.getByRole('button',{name:'Got It'}).click();await timeout.page.getByRole('article',{name:'Gaming Time: 15 min',exact:true}).waitFor();await infoCheck(timeout);await timeout.context.close();ok('real deadline while Info stays open settles exactly once');
  for(const seed of [{revealed:[0],status:'COLLECTED',ticket:'REDEEMED'},{revealed:[0],status:'COLLECTED',ticket:'UNUSED',expired:true}]){
   const game=await member(seed);await game.page.getByText(seed.expired?'Reward redemption deadline has passed.':'Reward already redeemed.',{exact:true}).first().waitFor();assert.equal(await game.page.locator('.reward-ticket-card').count(),0);await game.context.close();
  }ok('real redeemed and expired tickets excluded');
  for(const greens of [2,3,4]) {
   const game=await member({revealed:Array.from({length:greens},(_,i)=>i)});const reward=rules.rewards[greens-1];const before=game.counts();
   await noReload(game,async()=>{await game.page.getByRole('button',{name:`Collect ${reward.value<60?`${reward.value} min`:`${reward.value/60} ${reward.value===60?'hour':'hours'}`}`,exact:true}).click();await game.page.getByRole('article',{name:`Gaming Time: ${reward.value} min`,exact:true}).waitFor();});
   assert.equal(game.counts().posts,before.posts+1);assert.equal(game.counts().reads,before.reads);assert.equal(await prisma.armoryTicket.count({where:{sourceRefId:game.entry.id}}),1);await game.context.close();
  }ok('real 30/60/120-minute collection, one ticket and no reward-triggered refresh');
  const ready=await member(null);await ready.page.getByRole('button',{name:'Start free daily run',exact:true}).click();
  await ready.page.getByRole('button',{name:'Refresh Guild Expedition'}).click();await ready.page.waitForFunction(()=>!document.querySelector('[aria-label="Refresh Guild Expedition"]').disabled);
  assert.equal(await tile(ready.page,0).isEnabled(),true);assert.equal(await ready.page.getByRole('button',{name:'Pick a tile'}).count(),1);await ready.context.close();ok('manual refresh preserves Play readiness without consuming an attempt');
  const interrupted=await member({revealed:[0]});
  await interrupted.page.route('**/api/guess-36/collect',route=>commitThenDrop(route,interrupted.context));
  await noReload(interrupted,async()=>{await interrupted.page.getByRole('button',{name:'Collect 15 min',exact:true}).click();await interrupted.page.getByRole('button',{name:'Check result',exact:true}).waitFor();});
  assert.equal(await tile(interrupted.page,1).isEnabled(),false);assert.equal(interrupted.counts().posts,1);
  await noReload(interrupted,async()=>{await interrupted.page.getByRole('button',{name:'Check result',exact:true}).click();await interrupted.page.getByRole('article',{name:'Gaming Time: 15 min',exact:true}).waitFor();});
  assert.equal(interrupted.counts().posts,1);assert.equal(await prisma.armoryTicket.count({where:{sourceRefId:interrupted.entry.id}}),1);
  await noReload(interrupted,async()=>{await interrupted.page.getByRole('button',{name:'View board',exact:true}).click();await interrupted.page.getByRole('button',{name:'Back to game',exact:true}).waitFor();assert.equal(await interrupted.page.getByRole('button',{name:/^Tile \d+:/}).count(),36);await interrupted.page.getByRole('button',{name:'Back to game',exact:true}).click();await interrupted.page.getByRole('button',{name:'View board',exact:true}).waitFor();assert.equal(await interrupted.page.getByRole('button',{name:/^Tile \d+:/}).count(),1);});
  await interrupted.context.close();ok('real committed-but-lost response recovers once; board inspection preserves result');
  const firstInterrupted=await member(null);await firstInterrupted.page.getByRole('button',{name:'Start free daily run',exact:true}).click();
  await firstInterrupted.page.route('**/api/guess-36/reveal',route=>commitThenDrop(route,firstInterrupted.context));
  await tile(firstInterrupted.page,0).click();await firstInterrupted.page.getByRole('button',{name:'Check result',exact:true}).waitFor();await firstInterrupted.page.getByRole('button',{name:'Check result',exact:true}).click();await firstInterrupted.page.getByRole('button',{name:/^Tile 1:/}).waitFor();assert.equal(firstInterrupted.counts().posts,1);assert.equal(await prisma.guess36Entry.count({where:{userId:firstInterrupted.user.id}}),1);await firstInterrupted.context.close();ok('real interrupted first reveal recovers the same daily attempt');
  const clock=await member({revealed:[0]});const timeLeft=clock.page.getByRole('timer').locator('strong');const seconds=text=>text.split(':').reduce((minutes,value)=>minutes*60+Number(value),0);
  const beforeClock=seconds(await timeLeft.innerText());await clock.page.evaluate(()=>{window.__realNow=Date.now;Date.now=()=>window.__realNow()+7*86400000;});await clock.page.waitForTimeout(2200);const afterClock=seconds(await timeLeft.innerText());assert.ok(afterClock<=beforeClock-1&&afterClock>=beforeClock-4,{beforeClock,afterClock});await clock.page.evaluate(()=>Date.now=window.__realNow);await clock.context.close();ok('real active countdown survives a seven-day phone-clock jump');
  const devices=await member({revealed:[0]});const secondContext=await browser.newContext();await login(secondContext,devices.user);const second=await secondContext.newPage();
  const secondReady=second.waitForResponse(response=>response.url().includes('/api/guess-36/current'));
  await second.goto(base+'/guess-36');await second.getByRole('heading',{name:'Guild Expedition',exact:true}).waitFor();await secondReady;
  await second.waitForFunction(()=>!document.querySelector('[aria-label="Refresh Guild Expedition"]').disabled);
  // Commit from the other authenticated device without changing browser focus.
  const remotePick=await devices.context.request.post(base+'/api/guess-36/reveal',{data:{date:today(),index:1,runId:devices.entry.id,version:devices.entry.mineVersion},headers:{origin:base}});assert.equal(remotePick.status(),200);
  await tile(second,2).click();await second.getByRole('button',{name:'Check result',exact:true}).waitFor();assert.equal(await tile(second,3).isEnabled(),false);await second.getByRole('button',{name:'Check result',exact:true}).click();await tile(second,1,'loot').waitFor();await second.getByRole('button',{name:'Collect 30 min',exact:true}).click();await second.getByRole('article',{name:'Gaming Time: 30 min'}).waitFor();await devices.page.getByRole('button',{name:'Refresh Guild Expedition'}).click();await devices.page.getByRole('article',{name:'Gaming Time: 30 min'}).waitFor();assert.equal(await prisma.armoryTicket.count({where:{sourceRefId:devices.entry.id}}),1);await secondContext.close();await devices.context.close();ok('two real devices recover stale versions and share one committed ticket');
  }
  const session=await member({revealed:[0]});await session.context.clearCookies();await noReload(session,async()=>{await tile(session.page,1).click();await session.page.getByRole('button',{name:'Check result',exact:true}).waitFor();await session.page.getByRole('button',{name:'Check result',exact:true}).click();await session.page.getByRole('link',{name:'Sign in to play',exact:true}).waitFor();});assert.equal(await session.page.getByRole('button',{name:/^Tile /}).count(),0);await session.context.close();ok('expired session hides the board through in-place recovery');
  const leaving=await member({revealed:[0]});let releaseLeaving,leavingCommitted;const leavingReady=new Promise(resolve=>leavingCommitted=resolve);const leavingResponse=new Promise(resolve=>releaseLeaving=resolve);
  await leaving.page.route('**/api/guess-36/collect',async route=>{const response=await route.fetch();leavingCommitted();await leavingResponse;await route.fulfill({response}).catch(()=>{});});
  await leaving.page.getByRole('button',{name:'Collect 15 min',exact:true}).click();await leavingReady;await leaving.page.getByRole('link',{name:'Back to Home',exact:true}).click();await leaving.page.waitForURL(base+'/');releaseLeaving();await leaving.page.waitForTimeout(250);await leaving.page.goBack();await leaving.page.getByRole('article',{name:'Gaming Time: 15 min',exact:true}).waitFor();assert.equal(leaving.counts().posts,1);assert.equal(await prisma.armoryTicket.count({where:{sourceRefId:leaving.entry.id}}),1);await leaving.context.close();ok('navigation during a committed request and Back recover one ticket');
  const deadline=await member({revealed:[0],seconds:4});await deadline.page.route('**/api/guess-36/current*',route=>route.abort('failed'));const deadlineReads=deadline.counts().reads;
  await deadline.page.getByRole('button',{name:'Check result',exact:true}).waitFor({timeout:15000});await deadline.page.waitForTimeout(1200);assert.equal(deadline.counts().reads,deadlineReads+1);await deadline.page.unroute('**/api/guess-36/current*');await deadline.page.getByRole('button',{name:'Check result',exact:true}).click();await deadline.page.getByRole('article',{name:'Gaming Time: 15 min'}).waitFor();await deadline.context.close();ok('failed deadline recovery does not poll; explicit retry settles once');
  const overlap=await member({revealed:[0]});let releaseOverlap,overlapCommitted;const overlapReady=new Promise(resolve=>overlapCommitted=resolve);const overlapResponse=new Promise(resolve=>releaseOverlap=resolve);const overlapBefore=overlap.counts();
  await overlap.page.route('**/api/guess-36/reveal',async route=>{const response=await route.fetch();overlapCommitted();await overlapResponse;await route.fulfill({response});});
  await noReload(overlap,async()=>{await tile(overlap.page,1).click();await overlapReady;await overlap.page.evaluate(()=>{for(let i=0;i<3;i++){Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));}});await overlap.page.waitForTimeout(200);releaseOverlap();await tile(overlap.page,1,'loot').waitFor();await overlap.page.waitForTimeout(500);});assert.equal(overlap.counts().posts,overlapBefore.posts+1);assert.equal(overlap.counts().reads,overlapBefore.reads+1);await overlap.page.evaluate(()=>delete document.hidden);await overlap.context.close();ok('simulated return events during a real pending action queue one reconciliation');
  const reanchor=await member({revealed:[0]});let anchorResponses=0;
  await reanchor.page.route('**/api/guess-36/current*',async route=>{const response=await route.fetch();const value=await response.json();anchorResponses++;if(anchorResponses%2===1)value.serverNow=new Date(Date.parse(value.run.expiresAt)+1).toISOString();await route.fulfill({response,json:value});});
  for(const target of [2,4]){await reanchor.page.getByRole('button',{name:'Refresh Guild Expedition'}).click();const started=Date.now();while(anchorResponses<target){if(Date.now()-started>10000)throw Error('Deadline did not re-anchor');await reanchor.page.waitForTimeout(100);}await reanchor.page.waitForFunction(()=>!document.querySelector('[aria-label="Refresh Guild Expedition"]').disabled);assert.notEqual(await reanchor.page.getByRole('timer').locator('strong').innerText(),'0:00');}await reanchor.context.close();ok('mocked early expiry re-anchors to an active server result and can settle again');
  const midnight=await member({revealed:[0],status:'COLLECTED',ticket:'UNUSED'});let boundaryResponses=0;let boundary;
  await midnight.page.route('**/api/guess-36/current*',async route=>{const response=await route.fetch();const value=await response.json();boundary??=Date.parse(value.nextDayAt);boundaryResponses++;const after=boundaryResponses>1;value.serverNow=new Date(boundary+(after?100:-1000)).toISOString();if(after){value.date=new Date(boundary+19800100).toISOString().slice(0,10);value.nextDayAt=new Date(boundary+86400000).toISOString();}if(value.run?.ticket)value.run.ticket.expiresAt=new Date(boundary).toISOString();value.rewardTickets.forEach(ticket=>ticket.expiresAt=new Date(boundary).toISOString());if(!new URL(route.request().url()).searchParams.has('recover')){value.run=null;value.rewardTickets=[];value.eligibility.freeAvailable=true;value.eligibility.review.date=value.date;value.eligibility.review.nextResetAt=value.nextDayAt;}await route.fulfill({response,json:value});});
  await midnight.page.getByRole('button',{name:'Refresh Guild Expedition'}).click();await midnight.page.getByRole('button',{name:'Guild Expedition rules'}).click();await midnight.page.getByRole('button',{name:"Today's expedition",exact:true}).waitFor({state:'attached',timeout:10000});assert.equal(await midnight.page.getByRole('dialog').isVisible(),true);assert.equal(boundaryResponses,2);await midnight.page.keyboard.press('Escape');assert.equal(await midnight.page.getByRole('article',{name:'Gaming Time: 15 min'}).count(),0);await noReload(midnight,async()=>{await midnight.page.getByRole('button',{name:"Today's expedition",exact:true}).click();await midnight.page.getByRole('button',{name:'Start free daily run',exact:true}).waitFor();});await midnight.context.close();ok('mocked midnight UI keeps Info/result, expires ticket and opens today without loader');
  const refreshing=await member({revealed:[0]});let refreshRelease;const refreshGate=new Promise(resolve=>refreshRelease=resolve);
  await refreshing.page.route('**/api/guess-36/current*',async route=>{await refreshGate;await route.continue();});
  const beforeRefresh=refreshing.counts();await noReload(refreshing,async()=>{
   await refreshing.page.getByRole('button',{name:'Refresh Guild Expedition'}).click();await refreshing.page.getByRole('button',{name:'Guild Expedition rules'}).click();
   await refreshing.page.getByRole('dialog').waitFor();assert.equal(await tile(refreshing.page,0,'loot').count(),1);
   refreshRelease();await refreshing.page.getByRole('button',{name:'Refresh Guild Expedition'}).waitFor();await refreshing.page.waitForFunction(()=>!document.querySelector('[aria-label="Refresh Guild Expedition"]').disabled);
   assert.equal(await refreshing.page.getByRole('dialog').isVisible(),true);
  });assert.equal(refreshing.counts().reads,beforeRefresh.reads+1);await refreshing.page.keyboard.press('Escape');
  await refreshing.page.unroute('**/api/guess-36/current*');ok('real slow refresh preserves board, Info and document');
  // Chrome automation does not background tabs reliably. Exercise browser events explicitly;
  // this checks the handler, not physical-device/OS background scheduling.
  const focusOnly=refreshing.counts().reads;await refreshing.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await refreshing.page.waitForTimeout(250);assert.equal(refreshing.counts().reads,focusOnly,'ordinary window focus does not refresh');
  const beforeResume=refreshing.counts();await refreshing.page.evaluate(()=>{
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));
   window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'));
  });await refreshing.page.waitForTimeout(500);assert.equal(refreshing.counts().reads,beforeResume.reads+1);
  await refreshing.page.evaluate(()=>delete document.hidden);await refreshing.context.close();ok('simulated browser visibility/focus events coalesce to one refresh');
  }
  const bonusGame=await member({revealed:[5],status:'LOST'});
  await bonusGame.context.route('https://g.page/**',route=>route.fulfill({body:'Review-link destination stub',contentType:'text/plain'}));
  const popupReady=bonusGame.context.waitForEvent('page');
  await bonusGame.page.getByRole('link',{name:'Leave a review',exact:true}).click();
  const reviewPopup=await popupReady;await reviewPopup.close();
  await bonusGame.page.getByText('Today\u2019s review bonus claimed',{exact:true}).waitFor();
  const granted=await(await bonusGame.context.request.get(base+'/api/guess-36/current')).json();assert.equal(granted.eligibility.bonuses.length,1);
  assert.equal(await prisma.towerToken.count({where:{userId:bonusGame.user.id}}),0);
  await noReload(bonusGame,async()=>{await bonusGame.page.getByRole('button',{name:/Play.*bonus run/}).click();});
  await bonusGame.page.route('**/api/guess-36/reveal',route=>commitThenDrop(route,bonusGame.context));
  await tile(bonusGame.page,0).click();await bonusGame.page.getByRole('button',{name:'Check result',exact:true}).waitFor();
  assert.equal(bonusGame.counts().posts,1);await bonusGame.page.reload();
  await bonusGame.page.getByRole('button',{name:/^Tile 1:/}).waitFor({timeout:30000});
  assert.equal(bonusGame.counts().posts,1);assert.equal(await prisma.guess36Entry.count({where:{userId:bonusGame.user.id}}),2);
  assert.equal((await(await bonusGame.context.request.get(base+'/api/guess-36/current')).json()).eligibility.bonuses.length,0);
  await bonusGame.context.close();ok('actual review-link bonus, separate Tower wallet and reload recovery of a committed first reveal');
  for(const width of [320,375,430,1280]) {
   const vault=await member({revealed:[0]},{width,height:900},true);
   const grant=await vault.context.request.post(base+'/api/guess-36/review-token',{data:{date:today()},headers:{origin:base}});assert.equal(grant.status(),200);
   await vault.page.goto(base+'/vault');await vault.page.getByRole('heading',{name:'Your Vault',exact:true}).waitFor({timeout:30000});
   const card=vault.page.locator('article[data-game="guess36"]').first();await card.getByRole('link',{name:'Resume Expedition',exact:true}).waitFor();
   await card.getByText(/^1 bonus run available\. Next expires/).waitFor();
   assert.equal(await vault.page.getByRole('heading',{name:'Happy Tickets',exact:true}).count(),0);
   assert.equal(await vault.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await vault.page.screenshot({path:path.join(dir,`vault-${width}.png`),fullPage:true});
   if(width===375){const cdp=await vault.context.newCDPSession(vault.page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await vault.page.getByRole('button',{name:'Refresh Vault',exact:true}).click();await card.getByRole('link',{name:'Resume Expedition',exact:true}).waitFor();await cdp.detach();}
   await vault.context.close();ok(`actual Vault bonus/resume layout ${width}px with reduced motion`);
  }
  const adminGame=await member(null);await prisma.user.update({where:{id:adminGame.user.id},data:{role:'ADMIN'}});await login(adminGame.context,adminGame.user);
  const itemName=`Browser featured ${randomUUID().slice(0,8)}`;
  const itemResponse=await adminGame.context.request.post(base+'/api/admin/daily-spin/items',{data:{name:itemName,weight:1,rarity:'COMMON'},headers:{origin:base}});assert.equal(itemResponse.status(),201);const featured=(await itemResponse.json()).item;
  await prisma.setting.upsert({where:{key:'daily_spin_enabled'},create:{key:'daily_spin_enabled',value:'true'},update:{value:'true'}});
  await adminGame.page.goto(base+'/admin/daily-spin');
  await adminGame.page.getByLabel('Override reward').selectOption(featured.id);
  await adminGame.page.getByRole('button',{name:'Activate',exact:true}).click();await adminGame.page.getByRole('dialog').waitFor();
  await adminGame.page.keyboard.press('Escape');assert.equal(await adminGame.page.getByRole('dialog').count(),0);
  await adminGame.page.getByRole('button',{name:'Activate',exact:true}).click();await adminGame.page.getByRole('button',{name:'Confirm',exact:true}).click();await adminGame.page.getByText('Reward override is active. Guarantees take priority.',{exact:true}).waitFor();
  const player=await member(null);await player.page.goto(base+'/vault');await player.page.getByRole('heading',{name:'Your Vault',exact:true}).waitFor({timeout:30000});
  assert.equal(await player.page.getByText(/Featured ordinary reward/).count(),0);
  assert.doesNotMatch(JSON.stringify(await(await player.context.request.get(base+'/api/vault')).json()),/featuredReward|ADMIN_SELECTED|guaranteeReason/);
  const spinCard=player.page.locator('article[data-game="spin"]').filter({has:player.page.getByRole('heading',{name:'Daily Spin',exact:true})});
  const spinResponse=player.page.waitForResponse(response=>response.url()===base+'/api/daily-spin'&&response.request().method()==='POST');
  await spinCard.getByRole('button',{name:'Take your daily spin',exact:true}).click();const committed=await(await spinResponse).json();assert.equal(committed.reward.id,featured.id);assert.doesNotMatch(JSON.stringify(committed),/featuredReward|ADMIN_SELECTED|guaranteeReason|rewardSnapshot/);
  const resultDialog=player.page.getByRole('dialog');
  await resultDialog.getByRole('button',{name:'Back to Vault',exact:true}).waitFor({timeout:30000});
  assert.equal(await resultDialog.getByRole('button',{name:'Back to Vault',exact:true}).isEnabled(),true);
  assert.ok((await resultDialog.locator('.spin-cell-winner').innerText()).includes(itemName));
  assert.ok((await resultDialog.locator('.reward-reveal h3').innerText()).includes(itemName));
  await player.page.screenshot({path:path.join(dir,'vault-selected-spin.png'),fullPage:true});
  const history=await(await adminGame.context.request.get(base+'/api/admin/daily-spin/history?date='+today())).json();
  assert.equal(history.spins.find(spin=>spin.user.email===player.user.email).guaranteeReason,'ADMIN_SELECTED');
  const secondItemResponse=await adminGame.context.request.post(base+'/api/admin/daily-spin/items',{data:{name:'Changed '+itemName,weight:1,rarity:'COMMON'},headers:{origin:base}});
  assert.equal(secondItemResponse.status(),201);const secondItem=(await secondItemResponse.json()).item;
  await adminGame.page.getByRole('button',{name:'Refresh',exact:true}).click();
  await adminGame.page.getByLabel('Override reward').selectOption(secondItem.id);
  await adminGame.page.getByRole('button',{name:'Change selection',exact:true}).click();
  await adminGame.page.getByRole('button',{name:'Confirm',exact:true}).click();
  await adminGame.page.getByRole('dialog').waitFor({state:'hidden'});
  const changedPlayer=await member(null);const spinEntryAt=Date.now();await changedPlayer.page.goto(base+'/daily-spin');
  await changedPlayer.page.getByRole('button',{name:/SPIN NOW/i}).waitFor({timeout:30000});assert.ok(Date.now()-spinEntryAt>=4900,'five-second page loader is preserved');
  assert.equal(await changedPlayer.page.getByText(/Featured ordinary reward/).count(),0);
  const status=await(await changedPlayer.context.request.get(base+'/api/daily-spin')).json();
  assert.doesNotMatch(JSON.stringify(status),/featuredReward|ADMIN_SELECTED|guaranteeReason|selection/);
  const changedResult=changedPlayer.page.waitForResponse(response=>response.url()===base+'/api/daily-spin'&&response.request().method()==='POST');
  const spinningAt=Date.now();await changedPlayer.page.getByRole('button',{name:/SPIN NOW/i}).click();
  const newAward=await(await changedResult).json();assert.equal(newAward.reward.id,secondItem.id);
  await changedPlayer.page.locator('.reward-reveal h3').filter({hasText:secondItem.name}).waitFor();assert.ok(Date.now()-spinningAt>=4900,'original Spin sequence is preserved');
  await changedPlayer.page.screenshot({path:path.join(dir,'spin-private-override-375.png'),fullPage:true});
  await changedPlayer.context.close();
  const config=await(await adminGame.context.request.get(base+'/api/admin/daily-spin/selection')).json();assert.equal((await adminGame.context.request.put(base+'/api/admin/daily-spin/selection',{data:{...config,enabled:false},headers:{origin:base}})).status(),200);
  await player.context.close();await adminGame.context.close();ok('actual admin activation/change/disable, private Spin/Vault responses, internal history and unchanged reward presentation');
  const recoveredLoss=await member(null);const original=await(await recoveredLoss.context.request.get(base+'/api/guess-36/current')).json();
  const mockLoss={...original,eligibility:{...original.eligibility,freeAvailable:false,bonuses:[{id:'mock-spare-bonus',expiresAt:original.nextDayAt}]},run:{id:'mock-first-red',date:original.date,status:'LOST',version:2,startedAt:original.serverNow,expiresAt:new Date(Date.parse(original.serverNow)+90000).toISOString(),settledAt:original.serverNow,tiles:[{index:0,color:'RED'}],greens:0,reward:null,nextReward:null,ticketId:null,ticket:null}};
  await recoveredLoss.page.route('**/api/guess-36/reveal',route=>route.abort('failed'));
  await recoveredLoss.page.route('**/api/guess-36/current*',route=>route.fulfill({status:200,contentType:'application/json',json:mockLoss}));
  await recoveredLoss.page.getByRole('button',{name:'Start free daily run',exact:true}).click();await tile(recoveredLoss.page,0).click();
  await recoveredLoss.page.getByRole('button',{name:'Check result',exact:true}).click();await recoveredLoss.page.getByText('Game Over',{exact:true}).waitFor();
  assert.equal(await tile(recoveredLoss.page,1).isEnabled(),false);assert.equal(recoveredLoss.counts().posts,1);
  await recoveredLoss.page.getByRole('button',{name:/Play again.*bonus run/}).waitFor();
  await recoveredLoss.context.close();ok('mocked first-pick red recovery preserves the loss and requires explicit Play before the spare bonus');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:checks.length,errors,output:dir,database:'disposable SQLite',realAuthenticated:true},null,2));
 }finally {
  await Promise.allSettled(traceSaves.map(save=>save()));if(browser)await browser.close();await prisma.$disconnect();
  if(server && server.exitCode===null){if(compiledApp)server.kill();else server.send('close');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);if(server.exitCode===null)server.kill();}
  fs.closeSync(log);
 }
})().catch(error=>{console.error(error);console.error('Browser artifacts: '+dir);process.exitCode=1;});
