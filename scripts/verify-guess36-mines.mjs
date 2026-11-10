// Disposable verification only. Never reads the application's DATABASE_URL.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
const dir = mkdtempSync(path.join(tmpdir(), 'emiguild-mines-test-'));
const pgMode = process.argv.includes('--postgres');
let pg, client;
let serverStarted = false;
const baseline = path.join(dir, 'before.prisma');
writeFileSync(baseline, execFileSync('git', ['show', `f43c32e:prisma/schema${pgMode ? '.production' : ''}.prisma`], { encoding: 'utf8', windowsHide: true }));
const migration = `prisma/migrations/20261106000000_guess36_mines/migration${pgMode ? '' : '.sqlite'}.sql`;
let url = `file:${path.join(dir,'mines-test.db').replaceAll('\\','/')}`;
try {
 if(pgMode) {
  if(!process.env.MINES_PG_MODULE) throw Error('Set MINES_PG_MODULE to a local embedded-postgres module.');
  const { default: EmbeddedPostgres } = await import(pathToFileURL(process.env.MINES_PG_MODULE).href);
  const database=`emiguild_mines_${randomBytes(5).toString('hex')}`;
  const password=randomBytes(18).toString('hex');
  const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
  pg=new EmbeddedPostgres({databaseDir:path.join(dir,'data'),user:'postgres',password,port,persistent:true,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
  await pg.initialise();await pg.start().catch(()=>{throw Error('Disposable PostgreSQL could not start.');});serverStarted=true;await pg.createDatabase(database);
  client=pg.getPgClient(database);await client.connect();url=`postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
 }
 if(!pgMode) console.log(`Disposable SQLite: ${url}`);
 const env={...process.env,DATABASE_URL:url,DIRECT_URL:url,MINES_TEST_DATABASE_URL:url,NODE_ENV:'test'};
 const node=(file,args,options={})=>execFileSync(process.execPath,[file,...args],{env,stdio:'inherit',windowsHide:true,...options});
 const sql=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel',baseline,'--script'],{env,encoding:'utf8',windowsHide:true});
 const baselineSql=path.join(dir,'before.sql');writeFileSync(baselineSql,sql);
 const seed=`INSERT INTO users(id,name,email,password,"updatedAt") VALUES ('mines-preserved-user','Preserved','mines-preserved@example.test','fixture',CURRENT_TIMESTAMP);
 INSERT INTO guess_36_rounds(id,"roundDate",status,"winningNumber","publishedAt","updatedAt") VALUES ('mines-preserved-round','1999-01-01','DRAWN',12,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO guess_36_entries(id,"roundId","userId","selectionType","selectedNumber") VALUES ('mines-preserved-entry','mines-preserved-round','mines-preserved-user','NUMBER',12);
 INSERT INTO armory_tickets(id,"userId","rewardSnapshot",code,source,"sourceRefId","expiresAt","updatedAt") VALUES ('mines-preserved-ticket','mines-preserved-user','{}','mines-preserved-code','GUESS_36','mines-preserved-entry','2099-01-01',CURRENT_TIMESTAMP);`;
 const check=`SELECT "selectionType","selectedNumber","gameMode" FROM guess_36_entries WHERE id='mines-preserved-entry'`;
 if(pgMode) {
  await client.query(sql);await client.query(seed);
  const tablesBefore=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  await client.query(readFileSync(migration,'utf8'));
  await client.query(readFileSync('prisma/migrations/20261109000000_reward_updates/migration.sql','utf8'));
  const row=(await client.query(check)).rows[0];if(row.selectionType!=='NUMBER'||row.selectedNumber!==12||row.gameMode!=='LEGACY')throw Error('Legacy preservation failed');
  if(JSON.stringify(tablesBefore)!==JSON.stringify((await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows))throw Error('New game tables were added');
  if((await client.query("SELECT id FROM armory_tickets WHERE id='mines-preserved-ticket'")).rows.length!==1)throw Error('Ticket lost');
 } else {
  writeFileSync(path.join(dir,'seed.sql'),seed);
  const py=`import sqlite3,sys,json
c=sqlite3.connect(sys.argv[1]);c.executescript(open(sys.argv[2],encoding='utf-8').read());c.executescript(open(sys.argv[3],encoding='utf-8').read());before=c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall();c.executescript(open(sys.argv[4],encoding='utf-8').read());assert c.execute("SELECT selectionType,selectedNumber,gameMode FROM guess_36_entries WHERE id='mines-preserved-entry'").fetchone()==('NUMBER',12,'LEGACY');assert c.execute("SELECT id FROM armory_tickets WHERE id='mines-preserved-ticket'").fetchone();assert before==c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall();c.executescript(open(sys.argv[5],encoding='utf-8').read());assert c.execute("SELECT attemptKey FROM guess_36_entries WHERE id='mines-preserved-entry'").fetchone()==('FREE',);assert c.execute("SELECT happyBalanceDay FROM users WHERE id='mines-preserved-user'").fetchone()[0];assert not c.execute('PRAGMA foreign_key_check').fetchall();c.close()`;
  execFileSync('python',['-c',py,url.slice(5),baselineSql,path.join(dir,'seed.sql'),migration,'prisma/migrations/20261109000000_reward_updates/migration.sqlite.sql'],{stdio:'inherit',windowsHide:true});
 }
 node('node_modules/prisma/build/index.js',['generate',`--schema=prisma/schema${pgMode?'.production':''}.prisma`]);
 const drift=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-url',url,'--to-schema-datamodel',`prisma/schema${pgMode?'.production':''}.prisma`,'--script'],{env,encoding:'utf8',windowsHide:true});
 if(/CREATE TABLE|ALTER TABLE|DROP |CREATE INDEX|CREATE UNIQUE INDEX/.test(drift))throw Error(`Schema drift: ${drift}`);
 console.log(`${pgMode?'PostgreSQL':'SQLite'} migration: legacy row/ticket preserved, no new tables, no schema drift.`);
 node('node_modules/tsx/dist/cli.mjs',['--test','--test-concurrency=1','test/reward-updates/rewards.test.ts','test/reward-updates/post-merge-review.test.ts','test/reward-updates/happy-balance.test.ts','test/reward-updates/spin-public.test.ts','test/guess-36/mines.test.ts','test/guess-36/client-state.test.ts','test/guess-36/guess-36.test.ts','test/guess-36/rules.test.ts','test/guess-36/clock.test.ts',...(!pgMode ? ['test/guess-36/rename.test.ts'] : []),'test/guess-36/presentation.test.ts','test/guess-36/yesterday.test.ts']);
 node('test/guess-36/mines-http.test.cjs',[]);
 node('test/reward-updates/spin-public-http.test.cjs',[]);
 node('node_modules/tsx/dist/cli.mjs',['--test','--test-concurrency=1','test/armory/fusion-rules.test.ts','test/armory/fusion.test.ts','test/armory/daily-forge.test.ts','test/armory/admin-grant.test.ts','test/armory-marketplace/marketplace.test.ts','test/tower/reward-ticket.test.ts']);
 node('--test',['test/guess-36/mines-render.test.cjs']);
 console.log('Mine Run disposable verification passed.');
} finally {
 if(client)await client.end().catch(()=>{});
 if(pg && serverStarted) {
  const child=pg.process;
  let stopTimer;
  await Promise.race([pg.stop().catch(()=>{}),new Promise(resolve=>{stopTimer=setTimeout(resolve,3000);})]);
  clearTimeout(stopTimer);
  if(process.platform==='win32') {
   // Windows can leave a postmaster child holding inherited pipe handles.
   const ctl=path.resolve(path.dirname(process.env.MINES_PG_MODULE),'../../@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
   try { execFileSync(ctl,['-D',path.join(dir,'data'),'-m','fast','-w','stop'],{stdio:'ignore',windowsHide:true,timeout:15000}); } catch { /* Already stopped. */ }
  }
  // Windows descendants can retain inherited pipes after the postmaster exits.
  child?.stdin?.destroy();child?.stdout?.destroy();child?.stderr?.destroy();child?.unref();
 }
 execFileSync(process.execPath,['node_modules/prisma/build/index.js','generate','--schema=prisma/schema.prisma'],{stdio:'inherit',env:{...process.env,DATABASE_URL:'file:./mines-test.db'},windowsHide:true});
}
