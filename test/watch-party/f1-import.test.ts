import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { F1_2026_DRIVERS, F1_2026_RACES } from '../../data/watch-party/f1-2026';
import { prisma } from '../../lib/prisma';
import { getF12026ImportCatalog, importF12026WatchParties, WatchPartyError } from '../../lib/watch-party';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function istParts(value: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

test('bundles ten remaining 2026 races at their authoritative IST instants', () => {
  assert.equal(F1_2026_RACES.length, 10);
  const expected = [
    ['spain', '13', '09', '18', '30'], ['azerbaijan', '26', '09', '16', '30'],
    ['bahrain-malaysia', '04', '10', '12', '30'], ['singapore', '11', '10', '17', '30'],
    ['united-states', '26', '10', '01', '30'], ['mexico', '02', '11', '01', '30'],
    ['brazil', '08', '11', '22', '30'], ['las-vegas', '22', '11', '09', '30'],
    ['qatar', '29', '11', '21', '30'], ['abu-dhabi', '06', '12', '18', '30'],
  ];
  for (const [id, day, month, hour, minute] of expected) {
    const race = F1_2026_RACES.find((item) => item.id === id);
    assert.ok(race);
    const parts = istParts(race.kickoffAt);
    assert.deepEqual([parts.day, parts.month, parts.hour, parts.minute], [day, month, hour, minute]);
  }
});

test('bundles exactly 22 unique F1 drivers and returns defensive catalog copies', () => {
  assert.equal(F1_2026_DRIVERS.length, 22);
  assert.equal(new Set(F1_2026_DRIVERS.map((driver) => driver.key)).size, 22);
  assert.equal(new Set(F1_2026_DRIVERS.map((driver) => driver.name)).size, 22);
  const catalog = getF12026ImportCatalog();
  assert.equal(catalog.races.length, 10);
  assert.equal(catalog.drivers.length, 22);
  assert.notEqual(catalog.races, F1_2026_RACES);
  assert.notEqual(catalog.drivers, F1_2026_DRIVERS);
});

test('uses server-owned F1 data, deterministic imports, and compact result controls', () => {
  const service = read('lib/watch-party.ts');
  const createModal = read('components/admin/WatchPartyCreateModal.tsx');
  const resultModal = read('components/admin/F1ResultModal.tsx');
  const player = read('components/WatchPartyDetailClient.tsx');
  const admin = read('app/admin/watch-parties/page.tsx');
  assert.match(service, /id = `f1-2026-\$\{race\.id\}`/);
  assert.match(service, /source: F1_2026_SOURCE/);
  assert.match(service, /MAX_PREDICTION_OPTIONS = 24/);
  assert.match(createModal, /raceIds:selectedRaces/);
  assert.match(createModal, /driverMultipliers:driverMultiplierBasisPoints/);
  assert.match(resultModal, /Search driver/);
  assert.match(admin, /Set Winning Driver/);
  assert.match(player, /Search F1 drivers/);
});

test('the legacy football importer remains removed', () => {
  assert.equal(existsSync(new URL('../../app/api/admin/watch-parties/matches/route.ts', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../data/watch-party/premier-league-2026-27-fixtures.json', import.meta.url)), false);
});

test('rejects unknown, duplicate, and incomplete F1 batch inputs before writing', async () => {
  const multipliers = Object.fromEntries(F1_2026_DRIVERS.map((driver) => [driver.key, 100_000]));
  for (const input of [
    { raceIds: ['unknown'], driverMultipliers: multipliers },
    { raceIds: ['spain', 'spain'], driverMultipliers: multipliers },
    { raceIds: ['spain'], driverMultipliers: { RUSSELL: 100_000 } },
    { raceIds: ['spain'], driverMultipliers: { ...multipliers, EXTRA: 100_000 } },
  ]) {
    await assert.rejects(
      importF12026WatchParties('test-admin', input),
      (error: unknown) => error instanceof WatchPartyError && error.status === 400,
    );
  }
});

test('imports missing F1 races once with all 22 snapshotted driver choices', async () => {
  const raceIds = ['spain', 'azerbaijan'];
  const partyIds = raceIds.map((id) => `f1-2026-${id}`);
  const before = await prisma.watchParty.findMany({ where: { id: { in: partyIds } }, select: { id: true } });
  const beforeIds = new Set(before.map((party) => party.id));
  const multipliers = Object.fromEntries(F1_2026_DRIVERS.map((driver) => [driver.key, 100_000]));
  try {
    const first = await importF12026WatchParties('test-admin', { raceIds, entryFeeRupees: 100, entryCoins: 500, driverMultipliers: multipliers });
    const second = await importF12026WatchParties('test-admin', { raceIds, entryFeeRupees: 100, entryCoins: 500, driverMultipliers: multipliers });
    assert.equal(first.createdCount + first.skippedCount, 2);
    assert.equal(second.createdCount, 0);
    assert.equal(second.skippedCount, 2);
    const rows = await prisma.watchParty.findMany({ where: { id: { in: partyIds } } });
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.source, 'F1_2026');
      assert.equal(row.providerCompetitionCode, 'F1');
      assert.equal(JSON.parse(row.predictionOptions ?? '[]').length, 22);
    }
  } finally {
    const createdForTest = partyIds.filter((id) => !beforeIds.has(id));
    if (createdForTest.length) await prisma.watchParty.deleteMany({ where: { id: { in: createdForTest } } });
  }
});
