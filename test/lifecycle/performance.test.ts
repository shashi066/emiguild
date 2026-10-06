import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../lib/prisma';
import { loadEmailEvaluation } from '../../lib/lifecycle/evaluation';
import { runLifecycleEmails } from '../../lib/lifecycle/delivery';
import { GET as cron } from '../../app/api/cron/lifecycle/email/route';

function stub(t: { after: (fn: () => void) => void }, object: any, key: string, fn: (...args: any[]) => any) {
  const previous = object[key]; object[key] = fn; t.after(() => { object[key] = previous; });
}

test('cron rejects absent, wrong and missing-config credentials before any settings query', async (t) => {
  const original = process.env.CRON_SECRET;
  t.after(() => { if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original; });
  stub(t, prisma.setting, 'findMany', async () => { throw new Error('Unauthorized request accessed database'); });
  process.env.CRON_SECRET = 'local-test-secret';
  for (const authorization of ['', 'Bearer wrong', 'Bearer local-test-secreu']) {
    assert.equal((await cron(new Request('http://localhost/api/cron/lifecycle/email', { headers: { authorization } }))).status, 401);
  }
  delete process.env.CRON_SECRET;
  assert.equal((await cron(new Request('http://localhost/api/cron/lifecycle/email', { headers: { authorization: 'Bearer undefined' } }))).status, 401);
});

test('disabled campaigns read only two switches and never scan users or reserve a job', async (t) => {
  let reads = 0;
  stub(t, prisma.setting, 'findMany', async (args: any) => {
    reads++; assert.deepEqual(args.select, { key: true, value: true });
    assert.deepEqual(args.where.key.in, ['lifecycle_email_digest', 'lifecycle_comeback_email']);
    return [];
  });
  stub(t, prisma.setting, 'upsert', async () => { throw new Error('Unnecessary job reservation'); });
  stub(t, prisma.user, 'findMany', async () => { throw new Error('Unnecessary user scan'); });
  assert.deepEqual(await runLifecycleEmails({ testMode: true }), { disabled: true, evaluated: 0, sent: 0 });
  assert.equal(reads, 1);
});

test('suppressed players do not load Vault or activity counts', async (t) => {
  const now = new Date('2026-10-06T12:00:00Z');
  const user = { id: 'player', role: 'USER', email: 'player@example.test', createdAt: new Date('2026-01-01'), lastWebsiteVisitAt: null as Date | null, lifecycleEmailState: { unsubscribedAt: null as Date | null, nextComebackCheckAt: null } };
  stub(t, prisma.user, 'findUnique', async () => user as any);
  stub(t, prisma.setting, 'findMany', async () => [{ key: 'lifecycle_email_digest', value: 'true' }] as any);
  stub(t, prisma.lifecycleEmailDelivery, 'findMany', async () => [{ campaign: 'DIGEST', status: 'ACCEPTED', dispatchedAt: now }] as any);
  stub(t, prisma.armoryTicket, 'findMany', async () => { throw new Error('Unnecessary Vault query'); });
  stub(t, prisma.userDailySpin, 'count', async () => { throw new Error('Unnecessary activity query'); });
  user.lastWebsiteVisitAt = now;
  assert.equal(await loadEmailEvaluation(user.id, now), null);
  user.lastWebsiteVisitAt = null; user.lifecycleEmailState.unsubscribedAt = now;
  assert.equal(await loadEmailEvaluation(user.id, now), null);
  user.lifecycleEmailState.unsubscribedAt = null;
  assert.equal(await loadEmailEvaluation(user.id, now), null);
});
