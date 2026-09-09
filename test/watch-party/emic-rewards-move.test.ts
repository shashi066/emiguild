import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { EmicRewardsError, validateEmicRewardCatalog } from '../../lib/emic-rewards';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('moves EMIC Rewards out of Watch Party routes and response work', () => {
  const client = read('components/WatchPartyClient.tsx');
  const service = read('lib/watch-party.ts');
  const buildList = service.slice(service.indexOf('export async function getWatchPartyList'), service.indexOf('export async function getWatchPartyDetail'));

  assert.doesNotMatch(client, /watch-parties\/shop|state\.shop/);
  assert.doesNotMatch(buildList, /shop|watchPartyShopOrder|getEmicRewards/);
  for (const path of [
    'app/api/watch-parties/shop/route.ts',
    'app/api/watch-parties/shop/orders/route.ts',
    'app/api/admin/watch-parties/orders/route.ts',
    'app/api/admin/watch-parties/matches/route.ts',
  ]) {
    assert.equal(existsSync(new URL(`../../${path}`, import.meta.url)), false);
  }
});

test('provides dedicated player and admin EMIC Rewards routes', () => {
  const adminRewards = read('components/admin/AdminEmicRewards.tsx');
  assert.match(read('app/rewards/page.tsx'), /getEmicRewards/);
  assert.match(read('components/EmicRewardsClient.tsx'), /\/api\/emic-rewards\/orders/);
  assert.match(adminRewards, /\/api\/admin\/emic-rewards\/orders/);
  assert.match(adminRewards, /\/api\/admin\/emic-rewards\/config/);
  assert.match(adminRewards, />Food &amp; Drink</);
  assert.match(adminRewards, />Pass</);
  assert.match(adminRewards, /<AdminModalShell/);
  assert.match(adminRewards, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(adminRewards, /@media\(max-width:900px\)[\s\S]*?\.emic-catalog-list \{ grid-template-columns:1fr;/);
  assert.match(adminRewards, /@media\(max-width:520px\)[\s\S]*?\.emic-admin-order \{ grid-template-columns:1fr;/);
  const heroActions = read('components/HeroActions.tsx');
  assert.equal((heroActions.match(/href="\/rewards"/g) ?? []).length, 1);
  assert.match(heroActions, /label="EMIC Rewards".*href="\/rewards".*variant="gold".*emic-rewards-btn/);
  assert.match(read('components/admin/AdminSidebar.tsx'), /href: '\/admin\/rewards'.*label: 'EMIC Rewards'/);
  assert.match(read('app/api/admin/emic-rewards/config/route.ts'), /session\?\.user\?\.role === 'ADMIN'/);
  assert.match(read('app/api/settings/route.ts'), /emic_rewards_catalog/);
  assert.match(read('app/api/admin/settings/route.ts'), /emic_rewards_catalog/);
});

test('validates configurable pass and food reward items', () => {
  const items = validateEmicRewardCatalog([
    { itemKey: 'TEST_PASS', itemType: 'HOUR_PASS', label: 'Game Pass', category: 'Passes', detail: 'Two hours', tokenCost: 2000, accent: 'apex', isActive: true },
    { itemKey: 'TEST_SNACK', itemType: 'DRINK', label: 'Snack Combo', category: 'Food & Drink', detail: 'Collect at counter', tokenCost: 500, accent: 'drink', isActive: false },
  ]);
  assert.equal(items[0].itemType, 'HOUR_PASS');
  assert.equal(items[1].itemType, 'DRINK');
  assert.equal(items[1].isActive, false);
});

test('rejects unsafe EMIC catalog values', () => {
  assert.throws(
    () => validateEmicRewardCatalog([{ itemKey: 'BAD', itemType: 'DRINK', label: 'Drink', category: 'Food', detail: 'Counter', tokenCost: 0 }]),
    (error: unknown) => error instanceof EmicRewardsError && error.code === 'INVALID_CATALOG',
  );
  assert.throws(
    () => validateEmicRewardCatalog([
      { itemKey: 'SAME', itemType: 'HOUR_PASS', label: 'One', category: 'Pass', detail: 'One', tokenCost: 1 },
      { itemKey: 'SAME', itemType: 'DRINK', label: 'Two', category: 'Food', detail: 'Two', tokenCost: 2 },
    ]),
    /duplicate key/,
  );
});

test('new Watch Parties keep manual teams and expose the F1 batch importer', () => {
  const modal = read('components/admin/WatchPartyCreateModal.tsx');
  assert.match(modal, />Team Match</);
  assert.match(modal, />Import 2026 F1 Races</);
  assert.match(modal, /Select All/);
  assert.match(modal, /Search driver or team/);
  assert.match(modal, /Event Entry Fee \(₹\)/);
  assert.match(modal, /Check-in EMIC Reward/);
  assert.match(modal, /min="0" max="100000"/);
  assert.match(modal, /min="1" max="100000"/);
  assert.doesNotMatch(modal, /Premier League|football fixture/i);
});
