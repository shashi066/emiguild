const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');

// Exercise the real handlers, plan reader and cache wrappers without a database or Next server.
async function loadFixture(t) {
  const state = {
    session: { user: { id: 'catalog-admin', role: 'ADMIN' } },
    settings: new Map([['guild_membership_plans', JSON.stringify({ GUILD_HERO: { price: 599 } })]]),
    cached: new Map(), invalidations: [], planReads: 0, gameReads: 0,
    failPlanReads: 0, failGameReads: 0,
    games: [{ id: 'game-1', name: 'Test game', category: 'Single-Player Adventures' }],
  };
  globalThis.__catalogFixture = state;
  t.after(() => { delete globalThis.__catalogFixture; });
  const mocks = {
    '@/auth': 'export const auth=async()=>globalThis.__catalogFixture.session;',
    '@/lib/prisma': `export const prisma={setting:{
      findUnique:async()=>{const s=globalThis.__catalogFixture;s.planReads++;
        if(s.failPlanReads>0){s.failPlanReads--;throw Error('Plan read failed');}
        return {value:s.settings.get('guild_membership_plans')};},
      upsert:async a=>{const s=globalThis.__catalogFixture;
        const row=s.settings.has(a.where.key)?a.update:a.create;
        s.settings.set(a.where.key,row.value);return {key:a.where.key,...row};}
    },game:{findMany:async()=>{const s=globalThis.__catalogFixture;s.gameReads++;
      if(s.failGameReads>0){s.failGameReads--;throw Error('Game read failed');}return s.games;}}};`,
    'next/cache': `export const unstable_cache=(read,keys,options)=>async()=>{
      const s=globalThis.__catalogFixture,key=keys.join(':');
      if(s.cached.has(key))return s.cached.get(key).value;
      const value=await read();s.cached.set(key,{value,tags:options.tags});return value;};
      export const revalidateTag=(tag,profile)=>{const s=globalThis.__catalogFixture;
        s.invalidations.push({tag,profile});for(const [key,entry] of s.cached){if(entry.tags.includes(tag))s.cached.delete(key);}};`,
    '@/lib/november': 'export const requireCurrentUser=async()=>{};export const requireOrigin=()=>{};export const rewardFailure=e=>{throw e};export const NOVEMBER_FLAGS=[];',
    '@/lib/spin-selection': 'export const SPIN_SELECTION_KEY="spin_selection";',
    '@/lib/happy-config': 'export const HAPPY_CONFIG_KEY="happy_config";',
    '@/lib/lifecycle/settings-keys': 'export const MESSAGING_SETTING_KEYS=[];export const RETIRED_SPIN_SETTING_KEYS=[];',
    '@/lib/ps5-rental': 'export const PS5_RENTAL_STATUSES=["AVAILABLE"];',
    '@/lib/assistant/knowledge-cache': 'export const invalidateAssistantKnowledge=()=>{};',
  };
  const bundled = await build({
    stdin: { contents: `export { PUT } from './app/api/admin/settings/route';
      export { PATCH } from './app/api/admin/passes/route';
      export { loadCachedGuildMembershipPlans, loadCachedActiveGames } from './lib/public-catalog-cache';
      export { readGuildMembershipPlans } from './lib/guild-membership-server';`,
    resolveDir: process.cwd(), sourcefile: 'catalog-fixture.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{ name: 'catalog-fixtures', setup(b) {
      b.onResolve({ filter: /^(?:@\/|next\/cache$)/ }, a => mocks[a.path] ? { path: a.path, namespace: 'fixture' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: mocks[a.path], loader: 'js' }));
    } }],
  });
  const filename = path.join(process.cwd(), 'catalog-memory-fixture.cjs');
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = module.paths;
  mod._compile(bundled.outputFiles[0].text, filename);
  return { state, api: mod.exports };
}

const request = (method, body) => new Request('http://localhost/api/admin/settings', {
  method, headers: { 'Content-Type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify(body),
});
const heroPrice = plans => plans.find(plan => plan.type === 'GUILD_HERO').price;

test('both admin price-save paths invalidate the public plan cache', async t => {
  const { state, api } = await loadFixture(t);
  assert.equal(heroPrice(await api.loadCachedGuildMembershipPlans()), 599);
  await api.loadCachedGuildMembershipPlans(); assert.equal(state.planReads, 1);
  const saved = await api.PUT(request('PUT', [{ key: 'guild_membership_plans', value: JSON.stringify({ GUILD_HERO: { price: 799 } }) }]));
  assert.equal(saved.status, 200);
  assert.deepEqual(state.invalidations, [{ tag: 'public-guild-membership-plans', profile: { expire: 0 } }]);
  assert.equal(heroPrice(await api.loadCachedGuildMembershipPlans()), 799);

  const dedicated = await api.PATCH(request('PATCH', { action: 'updatePlan', passType: 'GUILD_HERO', price: 899,
    validityDays: 30, description: 'Updated Guild membership.', isActive: true }));
  assert.equal(dedicated.status, 200);
  assert.equal(state.invalidations.length, 2);
  assert.equal(heroPrice(await api.loadCachedGuildMembershipPlans()), 899);

  state.settings.set('guild_membership_plans', JSON.stringify({ GUILD_HERO: { price: 999 } }));
  assert.equal(heroPrice(await api.readGuildMembershipPlans()), 999, 'uncached readers still read current prices');
});

test('unrelated settings and rejected popup updates do not invalidate public prices', async t => {
  const { state, api } = await loadFixture(t);
  await api.loadCachedGuildMembershipPlans();
  assert.equal((await api.PUT(request('PUT', [{ key: 'controller_price', value: '100' }]))).status, 200);
  assert.equal((await api.PUT(request('PUT', [{ key: 'home_popup', value: '{}' }]))).status, 400);
  assert.deepEqual(state.invalidations, []);
  await api.loadCachedGuildMembershipPlans(); assert.equal(state.planReads, 1);
});

test('catalogue read failures do not cache fallback prices or an empty games list', async t => {
  const { state, api } = await loadFixture(t);
  t.mock.method(console, 'error', () => {});
  state.failPlanReads = 1; state.failGameReads = 1;
  assert.equal(heroPrice(await api.loadCachedGuildMembershipPlans()), 499);
  assert.equal(heroPrice(await api.loadCachedGuildMembershipPlans()), 599);
  await api.loadCachedGuildMembershipPlans(); assert.equal(state.planReads, 2);
  assert.deepEqual(await api.loadCachedActiveGames(), []);
  assert.deepEqual(await api.loadCachedActiveGames(), state.games);
  await api.loadCachedActiveGames(); assert.equal(state.gameReads, 2);
});

test('non-admin users cannot update prices or invalidate their cache', async t => {
  const { state, api } = await loadFixture(t);
  state.session.user.role = 'USER';
  assert.equal((await api.PUT(request('PUT', [{ key: 'guild_membership_plans', value: '{}' }]))).status, 403);
  assert.equal((await api.PATCH(request('PATCH', { action: 'updatePlan' }))).status, 403);
  assert.equal(state.planReads, 0);
  assert.deepEqual(state.invalidations, []);
});
