const testUrl = process.env.DATABASE_URL ?? '';
if (testUrl !== process.env.MINES_TEST_DATABASE_URL || !/mines[-_]test|emiguild_mines_/.test(testUrl)) throw Error('Use an explicit disposable Mines database.');
const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
async function load(entry) {
 const result = await build({ entryPoints:[entry],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'auth',setup(b){b.onResolve({filter:/^@\/auth$/},()=>({path:'auth',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const auth=async()=>globalThis.__minesSession;',loader:'js'}));}}]});
 const filename=path.join(process.cwd(),'mines-http-test.cjs');const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;mod._compile(result.outputFiles[0].text,filename);return mod.exports;
}
const req=(body,origin='http://localhost')=>new Request('http://localhost/api/guess-36/reveal',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('Mines mutations reject missing identity, cross-origin, malformed and extra fields before services',async()=>{
 for(const kind of ['reveal','collect']) {
  const route=await load(`app/api/guess-36/${kind}/route.ts`);globalThis.__minesSession=null;assert.equal((await route.POST(req({}))).status,401);
  globalThis.__minesSession={user:{id:'fixture'}};assert.equal((await route.POST(req({},'https://evil.example'))).status,403);
  assert.equal((await route.POST(req({}))).status,400);
  assert.equal((await route.POST(req(kind==='reveal'?{date:'2087-04-15',index:36}:{runId:'fixture',version:-1}))).status,400);
  assert.equal((await route.POST(req({date:'2087-04-15',index:0,userId:'other'}))).status,400);
  if(kind==='reveal')assert.equal((await route.POST(req({date:'2087-04-15',index:0,runId:'fixture'}))).status,400);
 }
 delete globalThis.__minesSession;
});
test('legacy submission stays closed and admin reads cannot use a stale non-existent admin identity',async()=>{
 const legacy=await load('app/api/guess-36/entries/route.ts');assert.equal((await legacy.POST(req({}))).status,410);
 const admin=await load('app/api/admin/guess-36/mines/route.ts');globalThis.__minesSession=null;assert.equal((await admin.GET(new Request('http://localhost'))).status,403);
 globalThis.__minesSession={user:{id:'not-an-admin',role:'ADMIN'}};assert.equal((await admin.GET(new Request('http://localhost'))).status,403);
 assert.equal((await admin.PATCH(req({enabled:true},'https://evil.example'))).status,403);
 delete globalThis.__minesSession;
});

test('actual handlers create and recover an owned daily run without exposing its hidden board',async()=>{
 const reveal=await load('app/api/guess-36/reveal/route.ts');const current=await load('app/api/guess-36/current/route.ts');const admin=await load('app/api/admin/guess-36/mines/route.ts');
 const db=globalThis.prisma;assert.ok(db);const user=await db.user.create({data:{name:'HTTP Mines fixture',email:`mine-http-${Date.now()}@example.test`,password:'fixture',role:'USER'}});
 try{
  await db.setting.upsert({where:{key:'guess_36_mines_enabled'},create:{key:'guess_36_mines_enabled',value:'true'},update:{value:'true'}});
  globalThis.__minesSession={user:{id:user.id,role:'USER'}};
  const date=new Date(Date.now()+19800000).toISOString().slice(0,10);
  const first=await reveal.POST(req({date,index:0}));assert.equal(first.status,200);const action=await first.json();const run=action.run;assert.ok(Number.isFinite(Date.parse(action.serverNow)));
  const replay=await reveal.POST(req({date,index:0}));assert.equal((await replay.json()).run.id,run.id);
  const response=await current.GET(new Request('http://localhost/api/guess-36/current'));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  const state=await response.json();assert.equal(state.run?.id??null,run.status==='ACTIVE'?run.id:null);if(state.run)assert.equal(state.run.tiles.length,1);assert.equal('history' in state,false);assert.equal('legacyHistory' in state,false);assert.doesNotMatch(JSON.stringify(state),/mineBoard|mineRules|password|sourceRefId/);
  const inspect=await current.GET(new Request(`http://localhost/api/guess-36/current?inspect=${run.id}`));assert.equal(inspect.status,run.status==='ACTIVE'?409:200);
  const recovery=await current.GET(new Request(`http://localhost/api/guess-36/current?recover=${run.id}`));assert.equal(recovery.status,200);assert.equal((await recovery.json()).run.tiles.length,1);
  assert.equal((await current.GET(new Request(`http://localhost/api/guess-36/current?recover=${run.id}&inspect=${run.id}`))).status,400);
  assert.equal((await current.GET(new Request('http://localhost/api/guess-36/current?recover=one&recover=two'))).status,400);
  globalThis.__minesSession={user:{id:user.id,role:'ADMIN'}};assert.equal((await admin.GET(new Request('http://localhost'))).status,403,'stale admin session must not authorize');
  await db.user.update({where:{id:user.id},data:{role:'ADMIN'}});assert.equal((await admin.GET(new Request('http://localhost?page=0'))).status,400);
  const page=await admin.GET(new Request('http://localhost?page=2'));assert.equal(page.status,200);assert.equal((await page.json()).page,2);
 }finally{delete globalThis.__minesSession;await db.guess36Entry.deleteMany({where:{userId:user.id}});await db.rewardReceipt.deleteMany({where:{actorId:user.id}});await db.user.delete({where:{id:user.id}});await db.$disconnect();}
});


test('review bonuses and Spin configuration handlers enforce origin, live admin roles, stale versions and internal Settings isolation',async()=>{
 const review=await load('app/api/guess-36/review-token/route.ts');const selection=await load('app/api/admin/daily-spin/selection/route.ts');const items=await load('app/api/admin/daily-spin/items/route.ts');const settings=await load('app/api/admin/settings/route.ts');const history=await load('app/api/admin/daily-spin/history/route.ts');
 const db=globalThis.prisma;const id=require('node:crypto').randomUUID();const user=await db.user.create({data:{name:'HTTP reward fixture',email:`reward-http-${id}@example.test`,password:'fixture',role:'USER'}});
 try{
  globalThis.__minesSession=null;assert.equal((await review.POST(req({}))).status,401);assert.equal((await selection.GET()).status,403);
  globalThis.__minesSession={user:{id:user.id,role:'ADMIN'}};
  assert.equal((await selection.GET()).status,403);assert.equal((await items.GET()).status,403);assert.equal((await history.GET(new Request('http://localhost'))).status,403);
  assert.equal((await selection.PUT(req({enabled:false,itemId:null,version:0},'https://evil.example'))).status,403);
  assert.equal((await review.POST(req({date:'2026-02-31'}))).status,400);
  const date=new Date(Date.now()+19800000).toISOString().slice(0,10);
  assert.equal((await review.POST(req({date},'https://evil.example'))).status,403);
  const grant=await review.POST(req({date}));assert.equal(grant.status,200);assert.equal((await (await review.POST(req({date}))).json()).id,(await grant.json()).id);
  assert.equal(await db.towerToken.count({where:{userId:user.id}}),0);
  await db.user.update({where:{id:user.id},data:{role:'ADMIN'}});
  const config=await(await selection.GET()).json();
  assert.equal((await selection.PUT(req({...config,version:config.version+100}))).status,409);
  assert.equal((await settings.PUT(req([{key:'daily_spin_selection',value:'{}'}]))).status,400);
  assert.equal((await settings.PUT(req([{key:'guess_36_mines_enabled',value:'true'}]))).status,400);
  assert.equal((await items.POST(req({name:'Invalid',weight:-1}))).status,400);
  assert.equal((await history.GET(new Request('http://localhost?date=2026-02-31'))).status,400);
 }finally{delete globalThis.__minesSession;await db.rewardReceipt.deleteMany({where:{actorId:user.id}});await db.user.delete({where:{id:user.id}});await db.$disconnect();}
});
