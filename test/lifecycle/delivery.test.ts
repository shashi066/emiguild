import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../lib/prisma';
import { ensureArmoryDefaults } from '../../lib/armory';
import { sendPlayerEmail, sendAdminTest, recoverInterrupted } from '../../lib/lifecycle/delivery';
import { loadEmailEvaluation } from '../../lib/lifecycle/evaluation';
import { unsubscribeEmail } from '../../lib/lifecycle/unsubscribe';

test('durable send limit, concurrent requests, read-only evaluation and unsubscribe', { skip: !process.env.LIFECYCLE_DB_TESTS }, async () => {
 assert.match(process.env.DATABASE_URL ?? '', /^file:.*lifecycle-test/);
 const now = new Date('2026-10-01T10:00:00Z');
 const user = await prisma.user.create({ data: { name: 'Email test', email: `email-${Date.now()}@example.test`, password: 'test', createdAt: new Date('2026-09-01T00:00:00Z') } });
 const before = await prisma.setting.findMany();
 const set = (key:string, value:string) => prisma.setting.upsert({ where:{key}, create:{key,value}, update:{value} });
 let calls = 0;
 const options = { now, testMode:true, secret:'s'.repeat(32), siteUrl:'https://emiguild.in', transport: async () => { calls++; return { status:'ACCEPTED' as const }; } };
 try {
  await ensureArmoryDefaults();
  for (const key of ['armory_enabled','daily_spin_enabled','guess_36_enabled','lifecycle_comeback_email','lifecycle_email_digest']) await set(key,'true');
  await prisma.lootItem.create({ data:{ id:user.id+'-loot', name:'Test', weight:1 } });
  const preview = await loadEmailEvaluation(user.id,now,{transportAvailable:true});
  assert.equal(preview?.preview.selected,'COMEBACK');
  assert.equal(await prisma.lifecycleEmailState.count({where:{userId:user.id}}),0);
  const results = await Promise.all([sendPlayerEmail(user.id,options),sendPlayerEmail(user.id,options)]);
  assert.equal(results.filter(status=>status==='ACCEPTED').length,1);
  assert.equal(calls,1);
  assert.equal(await prisma.lifecycleEmailDelivery.count({where:{userId:user.id}}),1);
  assert.equal((await prisma.lifecycleEmailState.findUnique({where:{userId:user.id}}))?.nextComebackCheckAt?.toISOString(),'2026-10-04T10:00:00.000Z');
  assert.equal(await sendPlayerEmail(user.id,options),'SUPPRESSED');
  assert.equal(calls,1);
  await prisma.lifecycleEmailDelivery.updateMany({where:{userId:user.id},data:{status:'SENDING',dispatchedAt:new Date(now.getTime()-600000)}});
  await recoverInterrupted(now);
  assert.equal((await prisma.lifecycleEmailDelivery.findFirst({where:{userId:user.id}}))?.status,'UNKNOWN');
  await prisma.lifecycleEmailDelivery.deleteMany({ where: { userId: user.id } });
  await prisma.lifecycleEmailState.update({ where: { userId: user.id }, data: { nextComebackCheckAt: null } });
  const ambiguous = { ...options, transport: async () => { calls++; throw new Error('Connection lost after DATA'); } };
  assert.equal(await sendPlayerEmail(user.id, ambiguous), 'UNKNOWN');
  const afterFailure = calls;
  assert.equal(await sendPlayerEmail(user.id, ambiguous), 'SUPPRESSED');
  assert.equal(calls, afterFailure, 'ambiguous sends must not be retried');
  await unsubscribeEmail({userId:user.id,email:user.email},now);
  assert.equal(await loadEmailEvaluation(user.id,now,{transportAvailable:true}), null);
 } finally {
  await prisma.user.delete({where:{id:user.id}});
  await prisma.lootItem.deleteMany({where:{id:user.id+'-loot'}});
  await prisma.setting.deleteMany();
  if(before.length) await prisma.setting.createMany({data:before});
  await prisma.$disconnect();
 }
});

test('admin test email uses its own durable daily cap and never sends player details', { skip: !process.env.LIFECYCLE_DB_TESTS }, async () => {
  assert.match(process.env.DATABASE_URL ?? '', /^file:.*lifecycle-test/);
  const admin = await prisma.user.create({ data: { name: 'Test Admin', email: 'mail-admin-' + Date.now() + '@example.test', password: 'test', role: 'ADMIN' } });
  let calls = 0;
  try {
    const options = { now: new Date('2026-10-06T12:00:00Z'), testMode: true, secret: 's'.repeat(32),
      transport: async (mail: { to: string; text: string }) => { calls++; assert.equal(mail.to, admin.email); assert.ok(mail.text.includes('No player account details')); return { status: 'ACCEPTED' as const }; } };
    for (let count = 0; count < 3; count++) assert.equal((await sendAdminTest(admin.id, options)).status, 'ACCEPTED');
    assert.equal((await sendAdminTest(admin.id, options)).status, 'LIMIT_REACHED');
    assert.equal(calls, 3);
  } finally { await prisma.user.delete({ where: { id: admin.id } }); await prisma.$disconnect(); }
});
