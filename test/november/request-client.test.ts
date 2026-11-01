import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PendingRewardError, submitRewardRequest } from '../../lib/reward-request-client';

test('interrupted admin PUT recovers its committed receipt without a second edit', async () => {
  const priorFetch = globalThis.fetch;
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const calls: { url: string; method?: string; body?: string }[] = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) } });
  try {
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), method: init?.method, body: init?.body as string }); throw new Error('Response lost'); };
    const payload = { benefitMode: 'HAPPY_TICKET', happyTicketId: 'ticket', expectedUpdatedAt: new Date().toISOString() };
    await assert.rejects(() => submitRewardRequest('admin:booking', 'ADMIN_BOOKING_EDIT', '/api/bookings/booking', payload, 'PUT'), PendingRewardError);
    const saved = JSON.parse([...values.values()][0]);
    assert.equal(calls[0].method, 'PUT'); assert.equal(JSON.parse(calls[0].body!).requestId, saved.requestId);
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), method: init?.method }); return Response.json({ booking: { id: 'booking', happyDiscount: 150 } }); };
    const result = await submitRewardRequest('admin:booking', 'ADMIN_BOOKING_EDIT', '/api/bookings/booking', payload, 'PUT');
    assert.equal(result.booking.happyDiscount, 150); assert.equal(calls.length, 2); assert.ok(calls[1].url.endsWith(saved.requestId)); assert.equal(values.size, 0);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('failed receipt reads keep recovery pending; uncommitted edits retry identical inputs only', async () => {
  const priorFetch = globalThis.fetch;
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const key = 'emiguild:reward:admin:booking:ADMIN_BOOKING_EDIT';
  const payload = { benefitMode: 'STANDARD' };
  const saved = { requestId: 'retry-edit-request-00001', payload };
  const values = new Map([[key, JSON.stringify(saved)]]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) } });
  try {
    globalThis.fetch = async () => { throw new Error('Offline'); };
    await assert.rejects(() => submitRewardRequest('admin:booking', 'ADMIN_BOOKING_EDIT', '/api/bookings/booking', payload, 'PUT'), PendingRewardError);
    assert.equal(values.size, 1);
    globalThis.fetch = async () => Response.json({}, { status: 404 });
    await assert.rejects(() => submitRewardRequest('admin:booking', 'ADMIN_BOOKING_EDIT', '/api/bookings/booking', { benefitMode: 'HAPPY_TICKET' }, 'PUT'), PendingRewardError);
    let put = 0;
    globalThis.fetch = async (_url, init) => {
      if (!init?.method) return Response.json({}, { status: 404 });
      put++; assert.equal(init.method, 'PUT'); assert.deepEqual(JSON.parse(init.body as string), { ...payload, requestId: saved.requestId });
      return Response.json({ error: 'Booking changed. Refresh first.' }, { status: 409 });
    };
    await assert.rejects(() => submitRewardRequest('admin:booking', 'ADMIN_BOOKING_EDIT', '/api/bookings/booking', payload, 'PUT'), /Booking changed/);
    assert.equal(put, 1); assert.equal(values.size, 0);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
