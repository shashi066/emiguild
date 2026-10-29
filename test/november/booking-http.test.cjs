// Real handlers + isolated database, mocked session and after-response mail scheduling.
// No listener, production account, email, or external payment request is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { build } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { NextRequest } = require('next/server');
const url=process.env.DATABASE_URL||'';
if(!(url.includes('november-test') || /\/emiguild_november_[a-z0-9_]+(?:\?|$)/.test(url)) || url!==process.env.NOVEMBER_TEST_DATABASE_URL) throw new Error('Use the explicitly named disposable November database.');
const prisma=new PrismaClient();
async function route(entry) {
  const result=await build({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'safe-handler-fixtures',setup(b){
    b.onResolve({filter:/^@\/auth$/},()=>({path:'session',namespace:'fixture'}));
    b.onResolve({filter:/^next\/server$/},()=>({path:'response',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='session'?'export const auth=async()=>globalThis.__bookingFixtureSession;':`export {NextRequest,NextResponse} from ${JSON.stringify(require.resolve('next/server'))};export const after=()=>{};`,loader:'js',resolveDir:process.cwd()}));
  }}]});
  const filename=path.join(process.cwd(),'booking-fixture-route.cjs');const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;mod._compile(result.outputFiles[0].text,filename);return mod.exports;
}
const req=(method,body,origin='http://localhost')=>new NextRequest('http://localhost/api/bookings',{method,headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)});
test('Happy Ticket booking handlers atomically price, replay, revalidate, restore and protect history',async()=>{
  try{
    const create=await route('app/api/bookings/route.ts');const update=await route('app/api/bookings/[id]/route.ts');const lookup=await route('app/api/admin/happy-tickets/customer/route.ts');const receipts=await route('app/api/rewards/receipts/[operation]/[requestId]/route.ts');
    const id=randomUUID();const owner=await prisma.user.create({data:{name:'Handler fixture',email:`handler-${id}@example.test`,password:'test-only'}});
    const admin=await prisma.user.create({data:{name:'Handler admin',email:`handler-admin-${id}@example.test`,password:'test-only',role:'ADMIN'}});
    const station=await prisma.station.create({data:{name:'Handler PS5',description:'test',specs:'test',hourlyRate:150}});
    const today=new Date();const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(today.getTime()+86400000));
    const expiresAt=new Date(`${date}T23:59:59.999+05:30`);
    const ticket=await prisma.happyTicket.create({data:{userId:owner.id,expiresAt,rulesSnapshot:JSON.stringify({stationIds:[station.id],days:[0,1,2,3,4,5,6],startTime:'16:00',endTime:'23:00'})}});
    for(const [key,value] of Object.entries({venue_capacity:'100',controller_price:'25'}))await prisma.setting.upsert({where:{key},create:{key,value},update:{value}});
    const payload={stationId:station.id,date,startTime:'16:00',duration:2,extraControllers:1,notes:'',benefitMode:'HAPPY_TICKET',happyTicketId:ticket.id,requestId:randomUUID()};
    globalThis.__bookingFixtureSession=null;assert.equal((await create.POST(req('POST',payload))).status,401);
    globalThis.__bookingFixtureSession={user:{id:owner.id,role:'USER'}};
    const response=await create.POST(req('POST',payload));assert.equal(response.status,201,await response.clone().text());const booking=(await response.json()).booking;
    assert.equal(booking.totalPrice,200);assert.equal(booking.happyDiscount,150);assert.equal(booking.controllerCharge,50);
    const replay=await create.POST(req('POST',payload));assert.equal((await replay.json()).booking.id,booking.id);
    assert.equal((await create.POST(req('POST',{...payload,duration:3}))).status,409);
    const params={params:Promise.resolve({id:booking.id})};
    globalThis.__bookingFixtureSession={user:{id:admin.id,role:'ADMIN'}};
    const editInput={...payload,startTime:'17:00',requestId:randomUUID(),expectedUpdatedAt:booking.updatedAt};
    const edited=await update.PUT(req('PUT',editInput),params);assert.equal(edited.status,200,await edited.clone().text());assert.equal((await edited.json()).booking.totalPrice,200);
    const adminBooking=await update.GET(new NextRequest('http://localhost/api/bookings/'+booking.id),params);assert.equal((await adminBooking.json()).booking.happyRedemptions[0].status,'APPLIED');
    const receiptResponse=await receipts.GET(new Request('http://localhost'),{params:Promise.resolve({operation:'ADMIN_BOOKING_EDIT',requestId:editInput.requestId})});assert.equal(receiptResponse.status,200);assert.equal((await receiptResponse.json()).booking.id,booking.id);
    assert.equal((await lookup.GET(new Request('http://localhost/api/admin/happy-tickets/customer?userId='+owner.id))).status,200);
    const invalid=await update.PUT(req('PUT',{...payload,duration:.5,requestId:randomUUID(),expectedUpdatedAt:booking.updatedAt}),params);assert.ok([400,409].includes(invalid.status));
    for (const method of ['PATCH','PUT','DELETE']) {
      const body=method==='PATCH'?{status:'CANCELLED'}:editInput;
      assert.equal((await update[method](req(method,body,'https://evil.example'),params)).status,403);
    }
    assert.equal((await prisma.happyTicket.findUniqueOrThrow({where:{id:ticket.id}})).status,'REDEEMED');
    await prisma.user.update({where:{id:admin.id},data:{role:'USER'}});
    assert.equal((await update.PUT(req('PUT',payload),params)).status,403);
    assert.equal((await update.PATCH(req('PATCH',{status:'CANCELLED'}),params)).status,403);
    assert.equal((await update.PATCH(req('PATCH',{status:'CHECKED_IN'}),params)).status,403);
    assert.equal((await update.DELETE(req('DELETE',{}),params)).status,403);
    assert.equal((await prisma.happyTicket.findUniqueOrThrow({where:{id:ticket.id}})).status,'REDEEMED');
    assert.equal(await prisma.happyRedemption.count({where:{bookingId:booking.id,status:'RESTORED'}}),0);

    assert.equal((await lookup.GET(new Request('http://localhost/api/admin/happy-tickets/customer?userId='+owner.id))).status,403);
    assert.equal((await receipts.GET(new Request('http://localhost'),{params:Promise.resolve({operation:'ADMIN_BOOKING_EDIT',requestId:editInput.requestId})})).status,403);
    globalThis.__bookingFixtureSession={user:{id:owner.id,role:'USER'}};
    assert.equal((await update.PATCH(req('PATCH',{status:'CANCELLED'},'https://evil.example'),params)).status,403);
    const cancelled=await update.PATCH(req('PATCH',{status:'CANCELLED'}),params);assert.equal(cancelled.status,200,await cancelled.clone().text());
    assert.equal((await prisma.happyTicket.findUniqueOrThrow({where:{id:ticket.id}})).status,'CLAIMED');
    assert.equal((await update.PATCH(req('PATCH',{status:'CANCELLED'}),params)).status,200);
    await prisma.user.update({where:{id:admin.id},data:{role:'ADMIN'}});globalThis.__bookingFixtureSession={user:{id:admin.id,role:'ADMIN'}};
    assert.equal((await update.DELETE(req('DELETE',{}),params)).status,409);
    assert.equal(await prisma.happyRedemption.count({where:{ticketId:ticket.id}}),1);
  }finally{delete globalThis.__bookingFixtureSession;await prisma.$disconnect();if(globalThis.prisma)await globalThis.prisma.$disconnect();}
});


test('Happy claim/reset handlers preserve recovery and expose compact admin refill history',async()=>{
  try{
    const claim=await route('app/api/happy-tickets/claim/route.ts');
    const reset=await route('app/api/happy-tickets/reset/route.ts');
    const state=await route('app/api/happy-tickets/route.ts');
    const manage=await route('app/api/admin/happy-tickets/route.ts');
    const receipts=await route('app/api/rewards/receipts/[operation]/[requestId]/route.ts');
    // Service tests use an injected future November clock; handlers use real time.
    // Remove only those disposable future refill fixtures before checking the latest real refill.
    await prisma.rewardAudit.deleteMany({where:{action:{in:['POOL_FORCE','POOL_ACTIVATE']},createdAt:{gt:new Date()}}});
    const suffix=randomUUID();
    const owner=await prisma.user.create({data:{name:'Ticket handler',email:'ticket-'+suffix+'@example.test',password:'fixture'}});
    const admin=await prisma.user.create({data:{name:'Ticket admin',email:'ticket-admin-'+suffix+'@example.test',password:'fixture',role:'ADMIN'}});
    const station=await prisma.station.create({data:{name:'Ticket handler PS5',description:'fixture',specs:'fixture',hourlyRate:150}});
    const config=JSON.stringify({stationIds:[station.id],days:[0,1,2,3,4,5,6],startTime:'00:00',endTime:'23:30'});
    await prisma.happyPool.upsert({where:{id:'main'},create:{id:'main',config,available:5},update:{config,available:5}});
    for(const key of ['happy_tickets_enabled','guild_resets_enabled'])await prisma.setting.upsert({where:{key},create:{key,value:'true'},update:{value:'true'}});
    globalThis.__bookingFixtureSession=null;
    assert.equal((await claim.POST(req('POST',{requestId:randomUUID()}))).status,401);
    const publicData=await (await state.GET()).json();assert.equal(publicData.wallet,null);
    globalThis.__bookingFixtureSession={user:{id:owner.id,role:'USER'}};
    assert.equal((await claim.POST(req('POST',{requestId:randomUUID()},'https://evil.example'))).status,403);
    const claimId=randomUUID();const claimed=await claim.POST(req('POST',{requestId:claimId}));
    assert.equal(claimed.status,200,await claimed.clone().text());const claimedData=await claimed.json();
    assert.equal((await (await claim.POST(req('POST',{requestId:claimId}))).json()).ticket.id,claimedData.ticket.id);
    assert.equal(await prisma.rewardAudit.count({where:{actorId:owner.id}}),0);
    const wallet=await (await state.GET()).json();assert.equal(wallet.wallet.tickets.length,1);assert.ok(wallet.wallet.nextClaimAt);
    assert.equal((await manage.GET(new Request('http://localhost/api/admin/happy-tickets'))).status,403);
    globalThis.__bookingFixtureSession={user:{id:admin.id,role:'ADMIN'}};
    const bankResponse=await manage.POST(req('POST',{kind:'RESET',input:{requestId:randomUUID(),action:'BANK',reason:'Handler bank fixture'}}));
    assert.equal(bankResponse.status,200,await bankResponse.clone().text());const bank=(await bankResponse.json()).result.reset;
    const before=await prisma.happyPool.findUniqueOrThrow({where:{id:'main'}});
    globalThis.__bookingFixtureSession={user:{id:owner.id,role:'USER'}};
    const resetId=randomUUID();const input={requestId:resetId,resetId:bank.id,version:before.version};
    assert.equal((await reset.POST(req('POST',input,'https://evil.example'))).status,403);
    const activated=await reset.POST(req('POST',input));assert.equal(activated.status,200,await activated.clone().text());
    assert.equal((await (await reset.POST(req('POST',input))).json()).resetId,bank.id);
    assert.equal((await reset.POST(req('POST',{...input,version:before.version+1}))).status,409);
    const audit=await prisma.rewardAudit.findUniqueOrThrow({where:{resetId:bank.id}});
    assert.equal(audit.actorId,owner.id);assert.equal(audit.action,'POOL_ACTIVATE');
    const after=await (await state.GET()).json();
    assert.equal(after.pool.available,5);assert.deepEqual(Object.keys(after.pool.lastRefill).sort(),['createdAt','id']);assert.equal(after.pool.lastRefill.id,audit.id);
    const receiptParams={params:Promise.resolve({operation:'HAPPY_RESET',requestId:resetId})};
    assert.equal((await receipts.GET(new Request('http://localhost'),receiptParams)).status,200);
    globalThis.__bookingFixtureSession={user:{id:admin.id,role:'ADMIN'}};
    assert.equal((await receipts.GET(new Request('http://localhost'),receiptParams)).status,404);
    const adminData=await (await manage.GET(new Request('http://localhost/api/admin/happy-tickets'))).json();
    const event=adminData.events.find(e=>e.id===audit.id);assert.equal(event.before,4);assert.equal(event.after,5);
    await prisma.user.update({where:{id:admin.id},data:{role:'USER'}});
    assert.equal((await manage.GET(new Request('http://localhost/api/admin/happy-tickets'))).status,403);
  }finally{delete globalThis.__bookingFixtureSession;await prisma.$disconnect();if(globalThis.prisma)await globalThis.prisma.$disconnect();}
});
