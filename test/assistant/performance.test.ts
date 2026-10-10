import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../lib/prisma';
import { getGuidedView } from '../../lib/assistant/guided';
import { getEffectiveSpinDate } from '../../lib/daily-spin';
import { recordAssistantUsage } from '../../lib/assistant/usage';
import { getAvailability } from '../../lib/assistant/tools';
import { getIndiaClock, addIndiaCalendarDays } from '../../lib/public-booking-time';
import { createVaultReader } from '../../lib/vault-client';
import { cleanupAssistantUsage } from '../../lib/assistant/retention';

function stub(t: { after: (fn: () => void) => void }, object: any, key: string, fn: (...args: any[]) => any) {
  const previous = object[key]; object[key] = fn; t.after(() => { object[key] = previous; });
}

test('multi-day availability uses one booking query and one capacity read', async (t) => {
  const date = addIndiaCalendarDays(getIndiaClock().date, 1)!;
  let queries = 0, capacityReads = 0;
  stub(t, prisma.station, 'findMany', async () => [{ id: 's1', name: 'PS1', hourlyRate: 100, minDuration: 0.5 }]);
  stub(t, prisma.setting, 'findMany', async () => []);
  stub(t, prisma.setting, 'findUnique', async () => { capacityReads++; return { value: '1' }; });
  stub(t, prisma.booking, 'findMany', async (args: any) => {
    queries++; assert.deepEqual(args.where.date, { gte: date, lte: addIndiaCalendarDays(date, 2) });
    return [0, 1].map((offset) => ({ date: addIndiaCalendarDays(date, offset), stationId: 's1', startTime: '00:00', endTime: '23:59' }));
  });
  const result = await getAvailability({ date, searchDays: 3, stationQuery: null, afterTime: null, duration: 1, quantity: 1 });
  assert.equal(result.date, addIndiaCalendarDays(date, 2));
  assert.equal(queries, 1); assert.equal(capacityReads, 1);
});

test('Vault refreshes share in-flight work, retain short freshness and isolate readers', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ pendingCount: calls }); });
  const first = createVaultReader<{ pendingCount: number }>('/api/vault/summary');
  const [a, b] = await Promise.all([first(), first()]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  await first(); assert.equal(calls, 1);
  await first(true); assert.equal(calls, 2);
  const second = createVaultReader('/api/vault/summary');
  await second(); assert.equal(calls, 3);
});

test('scheduled retention deletes only dates older than 90 days', async (t) => {
  let calls = 0;
  stub(t, prisma.assistantUsageDaily, 'deleteMany', async (args: any) => {
    calls++; assert.equal(args.where.date.lt, addIndiaCalendarDays(getIndiaClock().date, -90)); return { count: 3 };
  });
  assert.deepEqual(await cleanupAssistantUsage(), { count: 3 }); assert.equal(calls, 1);
});

test('Games requires one narrow game read and no station read', async (t) => {
  let calls = 0;
  stub(t, prisma.station, 'findMany', async () => { throw new Error('Unnecessary station read'); });
  stub(t, prisma.game, 'findMany', async (args: any) => {
    calls++; assert.deepEqual(args.select, { id: true, name: true });
    return [{ id: 'g', name: 'FC' }];
  });
  const view = await getGuidedView({ task: 'GAMES' }, { user: null });
  assert.equal(view.options[0].label, 'FC'); assert.equal(calls, 1);
});

test('guided spin uses one settings and one eligibility read without inventory or streak', async (t) => {
  process.env.AUTH_SECRET = 'test-guided-secret';
  let settings = 0, spins = 0;
  stub(t, prisma.setting, 'findMany', async () => { settings++; return []; });
  stub(t, prisma.userDailySpin, 'findUnique', async (args: any) => { spins++; assert.deepEqual(args.select, { attempts: true }); return null; });
  stub(t, prisma.userDailySpin, 'findMany', async () => { throw new Error('Unnecessary streak query'); });
  stub(t, prisma.lootItem, 'findMany', async () => { throw new Error('Unnecessary inventory query'); });
  const view = await getGuidedView({ task: 'SPIN' }, { user: { id: 'player' } });
  assert.equal(view.card?.kind, 'spin_confirmation');
  assert.equal(settings, 1); assert.equal(spins, 1);
});

test('optional metrics failure does not reject the completed operation', async (t) => {
  stub(t, prisma.assistantUsageDaily, 'upsert', async () => { throw new Error('metrics unavailable'); });
  t.mock.method(console, 'error', () => {});
  await assert.doesNotReject(recordAssistantUsage('user:test', { completedActions: 1 }));
});

test('spin reset clock handles IST midnight, custom hours, month and year boundaries', () => {
  for (const [time, hour, date, next] of [
    ['2026-12-31T18:30:00Z', 0, '2027-01-01', '2027-01-01T18:30:00.000Z'],
    ['2026-10-01T00:29:59Z', 6, '2026-09-30', '2026-10-01T00:30:00.000Z'],
    ['2026-10-01T00:30:00Z', 6, '2026-10-01', '2026-10-02T00:30:00.000Z'],
  ] as const) {
    const result = getEffectiveSpinDate(hour, new Date(time));
    assert.equal(result.spinDate, date); assert.equal(result.nextReset.toISOString(), next);
  }
});
