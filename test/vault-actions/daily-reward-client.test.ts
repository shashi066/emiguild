import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { animateDailySpin, DailyRewardError, executeDailyReward } from '../../lib/daily-reward-client';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const reward = { id: 'reward-1', name: 'Test reward' };
const spin = { spinDate: '2026-10-24', enabled: true, canSpin: true, nextReset: '2026-10-24T18:30:00Z', lootItems: [reward] };
const forge = { forge: { canForge: true, nextResetAt: spin.nextReset } };
function mockFetch(responses: (Response | Error)[]) {
  const calls: { url: string; method: string }[] = [];
  const fetcher = (async (url: any, init: any) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw Error('Unexpected extra request');
    return response;
  }) as typeof fetch;
  return { fetcher, calls };
}
const json = (data: unknown, status = 200) => Response.json(data, { status });

test('Spin preflights, submits once and returns authoritative result', async () => {
  const { fetcher, calls } = mockFetch([json(spin), json({ reward, streakReward: true })]);
  const result = await executeDailyReward('spin', 'spin-success', { fetcher, storage: storage() });
  assert.equal(result.reward.id, reward.id);
  assert.equal(result.streakReward, true);
  assert.deepEqual(calls.map(c => c.method), ['GET', 'POST']);
});
test('Forge uses armory preflight and forge POST', async () => {
  const { fetcher, calls } = mockFetch([json(forge), json({ selected: reward })]);
  assert.equal((await executeDailyReward('forge', 'forge-success', { fetcher, storage: storage() })).selected.id, reward.id);
  assert.deepEqual(calls.map(c => c.url), ['/api/armory', '/api/armory/forge']);
});
test('concurrent callers share one request sequence', async () => {
  const { fetcher, calls } = mockFetch([json(spin), json({ reward })]);
  const options = { fetcher, storage: storage() };
  const a = executeDailyReward('spin', 'duplicate', options);
  const b = executeDailyReward('spin', 'duplicate', options);
  assert.equal(a, b);
  await Promise.all([a, b]);
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
});
for (const [name, state] of [['already used', { ...spin, canSpin: false }], ['disabled', { ...spin, enabled: false }], ['missing grid', { ...spin, lootItems: [] }]] as const) {
  test(`Spin does not submit when ${name}`, async () => {
    const { fetcher, calls } = mockFetch([json(state)]);
    await assert.rejects(executeDailyReward('spin', name, { fetcher, storage: storage() }), DailyRewardError);
    assert.deepEqual(calls.map(c => c.method), ['GET']);
  });
}
test('expired session never submits', async () => {
  const { fetcher, calls } = mockFetch([json({ error: 'Unauthorized' }, 401)]);
  await assert.rejects(executeDailyReward('forge', 'expired', { fetcher, storage: storage() }), /Unauthorized/);
  assert.equal(calls.length, 1);
});
test('lost POST response reconciles saved Spin result', async () => {
  const legendary = { enabled: true, current: 21, target: 30, spinsRemaining: 9 };
  const streak = { current: 0, target: 10 };
  const { fetcher, calls } = mockFetch([json(spin), Error('connection lost'), json({ reward, legendary, streak, spinRecord: { id: 'receipt-spin', spinDate: spin.spinDate } })]);
  const result = await executeDailyReward('spin', 'lost-response', { fetcher, storage: storage() });
  assert.equal(result.reward.id, reward.id);
  assert.deepEqual(result.legendary, legendary);
  assert.deepEqual(result.streak, streak);
  assert.deepEqual(calls.map(c => c.method), ['GET', 'POST', 'GET']);
});
test('uncertain Forge remains read-only across retries and recovers later', async () => {
  const store = storage();
  const { fetcher, calls } = mockFetch([json(forge), Error('connection lost'), json(forge), json(forge), json({ forge: { ...forge.forge, canForge: false, todayClaim: { artifact: reward } } })]);
  const run = () => executeDailyReward('forge', 'uncertain', { fetcher, storage: store });
  await assert.rejects(run(), (e: DailyRewardError) => e.uncertain);
  await assert.rejects(run(), (e: DailyRewardError) => e.uncertain);
  assert.equal((await run()).selected.id, reward.id);
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
});
test('unreadable server response and failed reconciliation never replay POST', async () => {
  const store = storage();
  const { fetcher, calls } = mockFetch([json(spin), new Response('invalid JSON'), Error('offline'), json(spin)]);
  await assert.rejects(executeDailyReward('spin', 'bad-json', { fetcher, storage: store }), (e: DailyRewardError) => e.uncertain);
  await assert.rejects(executeDailyReward('spin', 'bad-json', { fetcher, storage: store }), (e: DailyRewardError) => e.uncertain);
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
});
test('known rejection is reported without inventing a result', async () => {
  const { fetcher, calls } = mockFetch([json(spin), json({ error: 'Already used' }, 429)]);
  await assert.rejects(executeDailyReward('spin', 'rejected', { fetcher, storage: storage() }), /Already used/);
  assert.equal(calls.length, 2);
});
test('Spin restores the original five-second sequence and settles on the server reward', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finished = false;
  let last: number | null = null;
  const result = animateDailySpin([{ id: 'other' }, reward], Promise.resolve({ reward }), value => { last = value; }, new AbortController().signal);
  void result.then(() => { finished = true; });
  await Promise.resolve();
  // Twenty quick steps, then eight slower steps: the winner locks at 4.4s.
  for (let step = 0; step < 20; step++) t.mock.timers.tick(60);
  for (let delay = 120; delay <= 680; delay += 80) t.mock.timers.tick(delay);
  assert.equal(last, 1);
  t.mock.timers.tick(599);
  await Promise.resolve();
  assert.equal(finished, false);
  t.mock.timers.tick(1);
  assert.equal((await result).reward.id, reward.id);
});

test('slow Spin never finishes before its server reward', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let accept!: (data: { reward: typeof reward }) => void;
  const pending = new Promise<{ reward: typeof reward }>(resolve => { accept = resolve; });
  let finished = false;
  let last: number | null = null;
  const result = animateDailySpin([reward], pending, value => { last = value; }, new AbortController().signal);
  void result.then(() => { finished = true; });
  for (let i = 0; i < 100; i++) t.mock.timers.tick(1000);
  assert.equal(finished, false);
  accept({ reward }); await Promise.resolve();
  t.mock.timers.tick(1000); t.mock.timers.tick(600);
  assert.equal((await result).reward.id, reward.id);
  assert.equal(last, 0);
});
test('animation cancellation clears timers and cannot reveal a late result', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  let highlights = 0;
  const result = animateDailySpin([reward], new Promise<{ reward: typeof reward }>(() => {}), () => { highlights++; }, controller.signal);
  controller.abort();
  await assert.rejects(result, /closed/);
  const count = highlights;
  t.mock.timers.tick(20000);
  assert.equal(highlights, count);
});
test('reduced motion skips random highlights and never falls back to the wrong tile', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const values: (number | null)[] = [];
  const result = animateDailySpin([{ id: 'different' }], Promise.resolve({ reward }), value => values.push(value), new AbortController().signal, true);
  await Promise.resolve(); t.mock.timers.tick(100); t.mock.timers.tick(1);
  await result;
  assert.deepEqual(values, [null]);
});

function advanceOriginalSpin(t: TestContext) {
  for (let step = 0; step < 20; step++) t.mock.timers.tick(60);
  for (let delay = 120; delay <= 680; delay += 80) t.mock.timers.tick(delay);
}

for (const responseAt of [4401, 5000, 6000]) {
  test(`a result at ${responseAt}ms lands immediately and reveals 600ms later, once`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    t.mock.method(Math, 'random', () => 0);
    const started = Date.now();
    let accept!: (data: { reward: typeof reward }) => void;
    const pending = new Promise<{ reward: typeof reward }>(resolve => { accept = resolve; });
    const highlights: [number, number | null][] = [];
    let completions = 0;
    const result = animateDailySpin([{ id: 'other' }, reward], pending,
      index => highlights.push([Date.now() - started, index]), new AbortController().signal);
    void result.then(() => { completions++; });
    advanceOriginalSpin(t);
    t.mock.timers.tick(responseAt - 4400);
    assert.equal(completions, 0);
    accept({ reward }); await Promise.resolve();
    assert.deepEqual(highlights.at(-1), [responseAt, 1]);
    const count = highlights.length;
    t.mock.timers.tick(599); await Promise.resolve();
    assert.equal(completions, 0);
    t.mock.timers.tick(1);
    assert.equal((await result).reward.id, reward.id);
    assert.equal(Date.now() - started, responseAt + 600);
    t.mock.timers.tick(10000); await Promise.resolve();
    assert.equal(completions, 1);
    assert.equal(highlights.length, count);
  });
}

test('cancelling during the winner pause prevents completion and further highlights', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  const highlights: (number | null)[] = [];
  let completions = 0;
  const result = animateDailySpin([reward], Promise.resolve({ reward }), value => highlights.push(value), controller.signal);
  void result.then(() => { completions++; }, () => {});
  await Promise.resolve(); advanceOriginalSpin(t);
  controller.abort();
  await assert.rejects(result, /closed/);
  const count = highlights.length;
  t.mock.timers.tick(10000);
  assert.equal(completions, 0);
  assert.equal(highlights.length, count);
});

test('a response arriving after cancellation cannot restart the animation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let accept!: (data: { reward: typeof reward }) => void;
  const pending = new Promise<{ reward: typeof reward }>(resolve => { accept = resolve; });
  const controller = new AbortController();
  const highlights: (number | null)[] = [];
  const result = animateDailySpin([reward], pending, value => highlights.push(value), controller.signal);
  t.mock.timers.tick(60); controller.abort();
  await assert.rejects(result, /closed/);
  const count = highlights.length;
  accept({ reward }); await Promise.resolve(); t.mock.timers.tick(10000);
  assert.equal(highlights.length, count);
});

test('a failed operation stops pending highlights without revealing a reward', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fail!: (cause: Error) => void;
  const pending = new Promise<{ reward: typeof reward }>((_, reject) => { fail = reject; });
  const highlights: (number | null)[] = [];
  const result = animateDailySpin([reward], pending, value => highlights.push(value), new AbortController().signal);
  t.mock.timers.tick(60); fail(new Error('Server rejected spin'));
  await assert.rejects(result, /Server rejected/);
  const count = highlights.length;
  t.mock.timers.tick(10000);
  assert.equal(highlights.length, count);
});

test('reduced motion reacts to a confirmed result without waiting for its next polling tick', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let accept!: (data: { reward: typeof reward }) => void;
  const pending = new Promise<{ reward: typeof reward }>(resolve => { accept = resolve; });
  const highlights: (number | null)[] = [];
  const result = animateDailySpin([reward], pending, value => highlights.push(value), new AbortController().signal, true);
  t.mock.timers.tick(50);
  assert.deepEqual(highlights, []);
  accept({ reward }); await Promise.resolve();
  assert.deepEqual(highlights, [0]);
  t.mock.timers.tick(0);
  assert.equal((await result).reward.id, reward.id);
});

test('an unknown committed reward is returned without highlighting an unrelated cell', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const highlights: (number | null)[] = [];
  const result = animateDailySpin([{ id: 'other' }], Promise.resolve({ reward }), value => highlights.push(value), new AbortController().signal);
  await Promise.resolve(); advanceOriginalSpin(t);
  assert.equal(highlights.at(-1), null);
  t.mock.timers.tick(600);
  assert.equal((await result).reward.id, reward.id);
});
