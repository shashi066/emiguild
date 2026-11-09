import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { revealMine, collectMine, getMineState, getMineAdmin, MINES_ENABLED_KEY } from '../../lib/guess-36-mines';
import { generateMineBoard, MINE_RULES, mineTicketExpiry, parseMineBoard, parseMineRevealed } from '../../lib/guess-36-mines-rules';
import { drawGuess36Round, getGuess36Current, redeemGuess36Ticket, getGuess36AdminData } from '../../lib/guess-36';
import { guess36Progress } from '../../lib/lifecycle/games';
const url = process.env.DATABASE_URL ?? '';
if (url !== process.env.MINES_TEST_DATABASE_URL || !/mines[-_]test|emiguild_mines_/.test(url)) throw Error('Use an explicit disposable Mines database.');
after(() => prisma.$disconnect());
const now = new Date('2087-04-15T12:00:00+05:30');
const date = '2087-04-15';
const fixed = (max: number) => max - 1;
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
async function setting(value: boolean) { await prisma.setting.upsert({ where: { key: MINES_ENABLED_KEY }, create: { key: MINES_ENABLED_KEY, value: String(value) }, update: { value: String(value) } }); }
async function owner() { await setting(true); return prisma.user.create({ data: { name: 'Mines fixture', email: `${randomUUID()}@example.test`, password: 'fixture' } }); }
async function start(id: string, index = 0, at = now) { return revealMine(id, { date: at === now ? date : at.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), index }, at, fixed); }
const pick = (id: string, run: {id: string; version: number; date: string}, index: number, at = now) => revealMine(id,{ date: run.date, index, runId: run.id, version: run.version },at,fixed);

test('board distribution, validated 36-bit-safe serialization, and following-day IST expiry', () => {
 for(let sample=0;sample<50;sample++) { const b=generateMineBoard(max=>Math.floor(Math.random()*max)); assert.equal(b.filter(c=>c==='GREEN').length,5);assert.equal(b.filter(c=>c==='RED').length,5);assert.equal(b.filter(c=>c==='YELLOW').length,26);assert.deepEqual(parseMineBoard(JSON.stringify(b)),b); }
 assert.deepEqual(parseMineRevealed('[0,31,32,35]'),[0,31,32,35]);
 assert.throws(()=>parseMineRevealed('[1,1]'));assert.throws(()=>parseMineBoard('[]'));assert.throws(()=>generateMineBoard(()=>100));
 assert.equal(mineTicketExpiry(new Date('2026-12-31T23:59:59+05:30')).toISOString(),'2027-01-01T18:30:00.000Z');
 assert.equal(MINE_RULES.rewards[4].name,'Bronze Pass (10 Hours)');
});
test('first reveal, yellow continuation, immutable board, daily protection and private serialization',async()=>{
 const u=await owner();const run=await start(u.id,35);assert.equal(run.status,'ACTIVE');assert.equal(run.greens,0);assert.deepEqual(run.tiles,[{index:35,color:'YELLOW'}]);
 const stored=await prisma.guess36Entry.findUniqueOrThrow({where:{id:run.id}});
 const next=await pick(u.id,run,0);assert.equal(next.greens,1);assert.equal(next.reward?.value,15);
 assert.equal((await prisma.guess36Entry.findUniqueOrThrow({where:{id:run.id}})).mineBoard,stored.mineBoard);
 const replay=await start(u.id,1);assert.equal(replay.tiles.length,2,'first-request retry cannot pick another tile');
 const state=await getMineState(u.id,now);assert.equal(state.run?.id,run.id);assert.equal(state.run?.tiles.length,2);assert.equal('history' in state,false);assert.equal('legacyHistory' in state,false);
 assert.doesNotMatch(JSON.stringify(state),/mineBoard|mineRules|mineRate|userId|password|code/);
 await assert.rejects(()=>getMineState(u.id,now,run.id),/Finish the run/);
});
test('each reward replaces the previous reward; collect and retry issue one ticket; redemption stays idempotent',async()=>{
 for(let target=1;target<=5;target++) {
  const u=await owner();let run=await start(u.id);
  for(let i=1;i<target;i++)run=await pick(u.id,run,i);
  assert.equal(run.greens,target);assert.equal(run.reward?.name,MINE_RULES.rewards[target-1].name);
  if(target<5)run=await collectMine(u.id,{runId:run.id,version:run.version},now);
  assert.equal(run.status,target===5?'COMPLETED':'COLLECTED');assert.ok(run.ticketId);
  const again=await collectMine(u.id,{runId:run.id,version:0},later(1));assert.equal(again.ticketId,run.ticketId);
  assert.equal(await prisma.armoryTicket.count({where:{source:'GUESS_36',sourceRefId:run.id}}),1);
  const ticket=await prisma.armoryTicket.findUniqueOrThrow({where:{id:run.ticketId!}});assert.equal(ticket.expiresAt.toISOString(),mineTicketExpiry(now).toISOString());
  const snap=JSON.parse(ticket.rewardSnapshot);assert.equal(snap.reward.name,run.reward?.name);if(target===5)assert.equal(snap.passType,'BRONZE');
  assert.equal((await redeemGuess36Ticket(ticket.id,now)).status,'REDEEMED');assert.equal((await redeemGuess36Ticket(ticket.id,now)).status,'REDEEMED');
  const inspect=await getMineState(u.id,now,run.id);assert.equal(inspect.run?.tiles.length,36);
 }
});
test('red loses uncollected progress, including a first-tile trap; no zero-green collection',async()=>{
 const u=await owner();let run=await start(u.id,10);await assert.rejects(()=>collectMine(u.id,{runId:run.id,version:run.version},now),/Find a green/);
 run=await pick(u.id,run,0);run=await pick(u.id,run,5);assert.equal(run.status,'LOST');assert.equal(run.reward,null);assert.equal(run.ticketId,null);
 const retry=await pick(u.id,run,1);assert.equal(retry.status,'LOST');assert.equal(retry.tiles.length,3);
 const other=await owner();assert.equal((await start(other.id,5)).status,'LOST');
});
test('duplicate and conflicting reveals are serialized; collection races cannot duplicate awards',async()=>{
 const u=await owner();let run=await start(u.id);
 const duplicate=await Promise.all([pick(u.id,run,1),pick(u.id,run,1)]);assert.equal(duplicate[0].version,duplicate[1].version);assert.equal(duplicate[0].greens,2);run=duplicate[0];
 const conflict=await Promise.allSettled([pick(u.id,run,2),pick(u.id,run,3)]);assert.equal(conflict.filter(r=>r.status==='fulfilled').length,1);
 run=(await getMineState(u.id,now)).run!;
 await Promise.allSettled([collectMine(u.id,{runId:run.id,version:run.version},now),pick(u.id,run,5)]);
 const final=(await getMineState(u.id,now,undefined,run.id)).run!;assert.ok(['COLLECTED','LOST'].includes(final.status));
 assert.equal((await getMineState(u.id,now)).run,null,'reload drops a finished run');
 assert.equal(await prisma.armoryTicket.count({where:{sourceRefId:run.id,source:'GUESS_36'}}),final.status==='COLLECTED'?1:0);
});
test('ownership, stale versions/dates, invalid positions and bounded persistent action limits',async()=>{
 const u=await owner();const other=await owner();const run=await start(u.id);
 await assert.rejects(()=>pick(other.id,run,1),/Run not found/);await assert.rejects(()=>collectMine(other.id,{runId:run.id,version:run.version},now),/Run not found/);
 await assert.rejects(()=>getMineState(other.id,now,run.id),/Run not found/);
 await assert.rejects(()=>pick(u.id,{...run,version:999},1),/run changed/);
 await assert.rejects(()=>pick(u.id,run,36),/Choose a tile/);
 await assert.rejects(()=>revealMine(u.id,{date:'2087-04-14',index:0},now),/new day/);
 await prisma.guess36Entry.update({where:{id:run.id},data:{mineRateAt:now,mineRateCount:90}});
 await assert.rejects(()=>pick(u.id,run,1),/Too many actions/);
 assert.equal((await pick(u.id,run,0,later(61))).greens,1);
});
test('timeout rejects extra reveals and uses original deadline for expiry despite delayed recovery',async()=>{
 const u=await owner();const run=await start(u.id);const late=new Date('2087-04-20T12:00:00+05:30');
 const result=await pick(u.id,run,1,late);assert.equal(result.status,'TIMED_OUT');assert.equal(result.greens,1);assert.equal(result.tiles.length,1);
 const ticket=await prisma.armoryTicket.findUniqueOrThrow({where:{id:result.ticketId!}});assert.equal(ticket.expiresAt.toISOString(),mineTicketExpiry(later(90)).toISOString());
 const no=await owner();const empty=await start(no.id,10);assert.equal((await collectMine(no.id,{runId:empty.id,version:empty.version},later(90))).reward,null);
});
test('pause blocks new starts, preserves active rules, and state access recovers timeout',async()=>{
 const u=await owner();const run=await start(u.id);const other=await owner();await setting(false);
 await assert.rejects(()=>start(other.id),/paused/);assert.equal((await pick(u.id,run,1)).greens,2);
 const state=await getMineState(u.id,later(91));assert.equal(state.run?.status,'TIMED_OUT');assert.equal(state.run?.reward?.value,30);
 assert.equal((await getMineState(u.id,later(92))).run,null,'timeout result is shown once, then a reload starts fresh');
 const replay=await getMineState(u.id,later(92),undefined,state.run!.id);assert.equal(replay.run?.ticketId,state.run?.ticketId);
});
test('cross-midnight runs keep deadline and resolve before the next day begins',async()=>{
 const u=await owner();const before=new Date('2087-04-16T23:59:40+05:30');
 const run=await revealMine(u.id,{date:'2087-04-16',index:0},before,fixed);
 const after=new Date('2087-04-17T00:00:10+05:30');assert.equal((await getMineState(u.id,after)).run?.id,run.id);
 const first=await revealMine(u.id,{date:'2087-04-17',index:1},after,fixed);assert.equal(first.id,run.id);assert.equal(first.tiles.length,1);
 await collectMine(u.id,{runId:run.id,version:run.version},after);
 const next=await revealMine(u.id,{date:'2087-04-17',index:0},after,fixed);assert.notEqual(next.id,run.id);
});

test('owned recovery retains an older settled result and ticket status without revealing the board',async()=>{
 const u=await owner();const other=await owner();const before=new Date('2087-06-01T23:59:40+05:30');
 const run=await revealMine(u.id,{date:'2087-06-01',index:0},before,fixed);
 const after=new Date('2087-06-02T00:01:11+05:30');
 const resumed=await getMineState(u.id,after);assert.equal(resumed.run?.id,run.id);assert.equal(resumed.run?.status,'TIMED_OUT');assert.equal(resumed.run?.tiles.length,1);
 const recovered=await getMineState(u.id,after,undefined,run.id);assert.equal(recovered.run?.ticketId,resumed.run?.ticketId);assert.equal(recovered.date,'2087-06-02');
 await redeemGuess36Ticket(recovered.run!.ticketId!,after);
 assert.equal((await getMineState(u.id,after,undefined,run.id)).run?.ticket?.status,'REDEEMED');
 await assert.rejects(()=>getMineState(other.id,after,undefined,run.id),/Run not found/);
 await assert.rejects(()=>getMineState(null,after,undefined,run.id),/Sign in/);
 await assert.rejects(()=>getMineState(u.id,after,run.id,run.id),/Choose recovery/);
 assert.equal((await getMineState(u.id,after)).run,null,'today view is available without consuming an attempt');
 const today=await revealMine(u.id,{date:'2087-06-02',index:10},after,fixed);assert.notEqual(today.id,run.id);
 assert.equal((await getMineState(u.id,after,undefined,run.id)).run?.id,run.id);
 assert.equal((await getMineState(u.id,after)).run?.id,today.id);
});
test('legacy records consume the daily attempt, legacy draws exclude Mines and preserve old tickets',async()=>{
 const u=await owner();const round=await prisma.guess36Round.upsert({where:{roundDate:date},create:{roundDate:date},update:{}});
 await prisma.guess36Entry.create({data:{userId:u.id,roundId:round.id,selectionType:'NUMBER',selectionValue:12}});
 await assert.rejects(()=>start(u.id),/already played/);assert.equal((await getMineState(u.id,now)).legacyUsedToday,true);
 const legacy=await getGuess36Current({id:u.id,role:'USER'},now,{readOnly:true});assert.equal(legacy.today.entry?.selection.type,'NUMBER');
 const mines=await owner();await start(mines.id);const mineLegacy=await getGuess36Current({id:mines.id,role:'USER'},now,{readOnly:true});assert.equal(mineLegacy.today.entry,null);
 await drawGuess36Round(date,new Date('2087-04-16T12:00:00+05:30'),{randomInt:()=>12});
 assert.equal((await getGuess36AdminData({roundDate:date,now:new Date('2087-04-16T12:00:00+05:30')})).items.every(i=>i.selection.type==='NUMBER'),true);
});
test('admin history never returns boards; Vault uses Guild Expedition facts without adding new panels',async()=>{
 const u=await owner();await start(u.id);const admin=await getMineAdmin(1,now);assert.ok(admin.total>0);assert.doesNotMatch(JSON.stringify(admin),/mineBoard|mineRevealed|mineRules/);
 const vault=(await guess36Progress(u.id,now)).game;assert.equal(vault.status,'active');assert.equal(vault.action,'Resume Expedition');assert.match(vault.summary,/1\/5/);
});

test('legacy draw does not publish a fabricated result for a Mines-only round',async()=>{
 const u=await owner();const at=new Date('2087-05-01T12:00:00+05:30');
 const run=await revealMine(u.id,{date:'2087-05-01',index:0},at,fixed);
 const draw=await drawGuess36Round('2087-05-01',new Date('2087-05-02T12:00:00+05:30'),{randomInt:()=>1});
 assert.equal(draw.winningNumber,null);assert.equal(draw.status,'OPEN');
 assert.equal((await prisma.guess36Entry.findUniqueOrThrow({where:{id:run.id}})).mineStatus,'ACTIVE');
});
