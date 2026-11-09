const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');

async function load(entry) {
  const mocks = {
    '@/auth': 'export const auth=async()=>globalThis.__spinPublic.session;',
    '@/lib/daily-spin': `export const getSpinState=async()=>globalThis.__spinPublic.state;
      export const getSpinSettings=async()=>({resetHour:0});
      export const getEffectiveSpinDate=()=>({spinDate:globalThis.__spinPublic.state.spinDate});`,
    '@/lib/spin-rewards': `import {RewardError} from '@/lib/november';
      const run=async()=>{const fixture=globalThis.__spinPublic;fixture.calls++;
        if(fixture.error)throw new RewardError(fixture.error,'Private override configuration',503);
        return fixture.result;};
      export const performDailySpin=run; export const recoverDailySpin=run;`,
    '@/lib/assistant/tokens': 'export const verifyActionToken=()=>globalThis.__spinPublic.confirmation;',
  };
  const bundled = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{ name: 'public-spin-fixtures', setup(b) {
      b.onResolve({ filter: /^@\// }, args => mocks[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }));
    } }] });
  const filename = path.join(process.cwd(), 'spin-public-http-fixture.cjs');
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = module.paths;
  mod._compile(bundled.outputFiles[0].text, filename);
  return mod.exports;
}
const request = (body = {}, headers = {}) => new Request('http://localhost/api/daily-spin', {
  method: 'POST', headers: { origin: 'http://localhost', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
function fixture() {
  const reward = { id: 'reward', name: 'PS5 time', rarity: 'COMMON', weight: 1, selected: true };
  const streak = { current: 1, target: 10, guaranteedToday: false, spinsRemaining: 9 };
  const legendary = { enabled: true, current: 1, target: 30, spinsRemaining: 29 };
  const spinRecord = { id: 'spin', spinDate: '2026-11-09', attempts: 1, lootItem: reward, guaranteeReason: 'ADMIN_SELECTED', rewardSnapshot: 'internal' };
  return { session: { user: { id: 'owner', role: 'USER' } }, calls: 0,
    confirmation: { action: 'DAILY_SPIN', userId: 'owner', spinDate: spinRecord.spinDate },
    state: { settings: { enabled: true }, canSpin: false, spinDate: spinRecord.spinDate, spin: spinRecord, streak, legendary,
      nextReset: new Date('2026-11-09T18:30:00Z'), items: [reward], featuredReward: reward },
    result: { success: true, reward, spinRecord, streak, legendary, remainingRetries: 0, streakReward: false,
      nextReset: '2026-11-09T18:30:00Z', guaranteeReason: 'ADMIN_SELECTED', featuredReward: reward } };
}

test('status, submission, assistant-confirmed submission and receipt recovery expose the same public rewards', async () => {
  globalThis.__spinPublic = fixture();
  try {
    const api = await load('app/api/daily-spin/route.ts');
    const recovery = await load('app/api/daily-spin/receipts/[requestId]/route.ts');
    const receiptInput = { params: Promise.resolve({ requestId: 'saved-request-12345' }) };
    const responses = [await api.GET(), await api.POST(request()),
      await api.POST(request({}, { 'x-assistant-confirmation': 'fixture' })),
      await recovery.GET(new Request('http://localhost'), receiptInput)];
    const bodies = [];
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /no-store/);
      const body = await response.json(); bodies.push(body);
      assert.doesNotMatch(JSON.stringify(body), /ADMIN_SELECTED|guaranteeReason|featuredReward|rewardSnapshot|"selected"/);
      assert.equal((body.reward ?? body.spin.lootItem).id, 'reward');
    }
    assert.deepEqual(bodies[1], bodies[3]);
    assert.equal(globalThis.__spinPublic.result.guaranteeReason, 'ADMIN_SELECTED');
    assert.equal(globalThis.__spinPublic.calls, 3);
  } finally { delete globalThis.__spinPublic; }
});

test('player endpoints preserve authentication and same-origin protection', async () => {
  globalThis.__spinPublic = fixture();
  try {
    const api = await load('app/api/daily-spin/route.ts');
    const recovery = await load('app/api/daily-spin/receipts/[requestId]/route.ts');
    globalThis.__spinPublic.session = null;
    assert.equal((await api.GET()).status, 401);
    assert.equal((await api.POST(request())).status, 401);
    assert.equal((await recovery.GET(new Request('http://localhost'), { params: Promise.resolve({ requestId: 'fixture' }) })).status, 401);
    globalThis.__spinPublic.session = fixture().session;
    assert.equal((await api.POST(request({}, { origin: 'https://other.example' }))).status, 403);
    assert.equal(globalThis.__spinPublic.calls, 0);
  } finally { delete globalThis.__spinPublic; }
});

test('invalid override configuration never exposes internal diagnostics through submission or recovery', async () => {
  globalThis.__spinPublic = { ...fixture(), error: 'SELECTED_REWARD_UNAVAILABLE' };
  try {
    const api = await load('app/api/daily-spin/route.ts');
    const recovery = await load('app/api/daily-spin/receipts/[requestId]/route.ts');
    for (const response of [await api.POST(request()), await recovery.GET(new Request('http://localhost'), { params: Promise.resolve({ requestId: 'fixture' }) })]) {
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { code: 'SPIN_UNAVAILABLE', error: 'Daily spin is temporarily unavailable. Your spin is unused.' });
    }
  } finally { delete globalThis.__spinPublic; }
});
