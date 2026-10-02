import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../lib/prisma';
import { ensureArmoryDefaults } from '../../lib/armory';
import { GameId } from '../../lib/lifecycle/rules';
import { getVaultState } from '../../lib/lifecycle/server';
import { gameLoaders, loadGameSections, artifactProgress, guess36Progress, spinProgress, towerProgress, guildDropProgress, watchPartyProgress, tournamentProgress } from '../../lib/lifecycle/games';
import { getTowerProgressSnapshot } from '../../lib/tower';
import { getEffectiveSpinDate } from '../../lib/daily-spin';

const now = new Date('2026-10-01T10:00:00Z');
const later = new Date(now.getTime() + 3600000);

test('one failed game keeps other game sections and does not fabricate messaging items', async () => {
  const loaders = { ...gameLoaders };
  for (const id of Object.keys(loaders) as GameId[]) loaders[id] = async () => {
    if (id === 'tower') throw new Error('simulated database failure');
    return { items: [], game: { id, title: id, status: 'empty', summary: 'No current activity', details: [], href: '/', action: 'View' } };
  };
  const sections = await loadGameSections('test', now, loaders);
  assert.equal(sections.length, 7);
  assert.equal(sections.find((row) => row.game.id === 'tower')?.game.status, 'error');
  assert.equal(sections.filter((row) => row.game.status === 'empty').length, 6);
  assert.deepEqual(sections.flatMap((row) => row.items), []);
});

test('game progress uses owned, published, current account state without writes', { skip: !process.env.LIFECYCLE_DB_TESTS }, async (t) => {
  assert.match(process.env.DATABASE_URL ?? '', /^file:.*lifecycle-test/);
  const prefix = `progress-${Date.now()}`;
  const user = await prisma.user.create({ data: { name: 'Progress player', email: `${prefix}@example.test`, password: 'test' } });
  const other = await prisma.user.create({ data: { name: 'Other player', email: `${prefix}-other@example.test`, password: 'test' } });
  const settingsBefore = await prisma.setting.findMany();
  const setting = (key: string, value: string) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  try {
    await ensureArmoryDefaults();
    await Promise.all(['armory_enabled', 'daily_spin_enabled', 'tower_enabled', 'guess_36_enabled'].map((key) => setting(key, 'true')));
    await setting('daily_spin_reset_hour', '0');
    const empty = await getVaultState(user.id, now);
    assert.equal(empty.games.length, 7);
    assert.ok(empty.games.every((row) => row.status !== 'error'));
    assert.equal(empty.games.find((row) => row.id === 'guild-drop')?.status, 'empty');
    assert.equal(empty.games.find((row) => row.id === 'watch-party')?.status, 'empty');
    assert.equal(empty.games.find((row) => row.id === 'tournaments')?.status, 'empty');
    assert.equal(await prisma.guess36Round.count({ where: { roundDate: '2026-10-01' } }), 0, 'read-only Vault must not create today’s round');

    await t.test('Guess 36 hides pending results and shows only the player’s selection and published reward', async () => {
      const previous = await prisma.guess36Round.create({ data: { id: `${prefix}-previous`, roundDate: '2026-09-30', status: 'DRAWN', winningNumber: 17, publishedAt: later } });
      const today = await prisma.guess36Round.create({ data: { id: `${prefix}-today`, roundDate: '2026-10-01' } });
      await prisma.guess36Entry.create({ data: { userId: user.id, roundId: previous.id, selectionType: 'NUMBER', selectionValue: 17 } });
      await prisma.guess36Entry.create({ data: { userId: user.id, roundId: today.id, selectionType: 'RANGE', selectionValue: 2 } });
      await prisma.guess36Entry.create({ data: { userId: other.id, roundId: today.id, selectionType: 'NUMBER', selectionValue: 36 } });
      const pending = await guess36Progress(user.id, now);
      assert.ok(pending.game.details.some((line) => line.includes('13-24')));
      assert.ok(!pending.game.details.some((line) => line.includes('17') || line.includes('36')));
      await prisma.guess36Round.update({ where: { id: previous.id }, data: { publishedAt: now } });
      const published = await guess36Progress(user.id, now);
      assert.ok(published.game.details.some((line) => line.includes('Your pick won')));
      assert.ok(published.game.details.some((line) => line.startsWith('Earned:')));
      await setting('guess_36_enabled', 'false');
      assert.equal((await guess36Progress(user.id, now)).game.status, 'disabled');
      await setting('guess_36_enabled', 'true');
    });
    await t.test('Spin displays one opportunity then used, daily reward, and actual streak', async () => {
      const loot = await prisma.lootItem.create({ data: { id: `${prefix}-loot`, name: 'Progress reward', rarity: 'COMMON', weight: 1 } });
      await setting('daily_spin_retries_enabled', 'true'); await setting('daily_spin_max_retries', '100');
      assert.equal((await spinProgress(user.id, now)).game.summary, 'Daily spin available');
      await prisma.userDailySpin.create({ data: { userId: user.id, spinDate: getEffectiveSpinDate(0, now).spinDate, lootItemId: loot.id, attempts: 100 } });
      const used = await spinProgress(user.id, now);
      assert.equal(used.game.summary, 'Today’s spin used');
      assert.equal(used.items.length, 0);
      assert.equal(used.game.progress?.current, 1);
      assert.ok(used.game.details.some((line) => line.includes('Progress reward')));
      await setting('daily_spin_enabled', 'false');
      assert.equal((await spinProgress(user.id, now)).game.status, 'disabled');
      await setting('daily_spin_enabled', 'true');
    });
    await t.test('Artifacts count owned copies and equipped matching pieces before offering a set reward', async () => {
      const artifacts = await prisma.armoryArtifact.findMany({ where: { setId: 'iron_vanguard' } });
      for (const artifact of artifacts) await prisma.armoryInventory.create({ data: { userId: user.id, artifactId: artifact.id, quantity: 1 } });
      const ids = Object.fromEntries(artifacts.map((artifact) => [artifact.slotType, artifact.id]));
      await prisma.armoryLoadout.create({ data: { userId: user.id, headgearArtifactId: ids.HEADGEAR, armorArtifactId: ids.ARMOR, glovesArtifactId: ids.GLOVES, bootsArtifactId: ids.BOOTS } });
      const full = await artifactProgress(user.id, now);
      assert.equal(full.game.progress?.current, 4);
      assert.equal(full.game.facts?.ownedArtifacts, 4);
      assert.equal(full.game.facts?.slots?.filter((slot) => slot.name).length, 4);
      assert.equal(full.game.facts?.canClaim, true);
      const equippedGoal = full.game.facts?.goals?.find((goal) => goal.id === 'iron_vanguard');
      assert.equal(equippedGoal?.missingOwned, 0);
      assert.equal(equippedGoal?.needsEquipment, false);
      assert.ok(full.game.details.includes('4 artifacts owned.'));
      assert.ok(full.game.details.some((line) => line.includes('ready to exchange')));
      await prisma.armoryDailyClaim.create({ data: { userId: user.id, claimDate: '2026-10-01', artifactId: ids.HEADGEAR } });
      assert.equal((await artifactProgress(user.id, now)).game.summary, 'Today’s artifact forged');
      await setting('armory_enabled', 'false');
      assert.equal((await artifactProgress(user.id, now)).game.status, 'disabled');
      await setting('armory_enabled', 'true');
    });
    await t.test('Tower exposes secured progress without card layouts and respects exact run expiry', async () => {
      const token = await prisma.towerToken.create({ data: { userId: user.id, expiresAt: later, status: 'USED' } });
      await prisma.towerToken.create({ data: { userId: user.id, expiresAt: later } });
      await prisma.towerToken.create({ data: { userId: other.id, expiresAt: later } });
      const reward = { id: 'test-reward', name: '30 minutes gaming', type: 'GAMING_TIME', value: 30 };
      const attempt = await prisma.towerAttempt.create({ data: { userId: user.id, tokenId: token.id, currentLevel: 3, securedLevel: 3, securedRewardSnapshot: JSON.stringify(reward),
        redCards: JSON.stringify(Array(10).fill('A')), resolvedPicks: JSON.stringify([{ level: 3, cardSlot: 'B', cardId: 'test', result: 'SAFE' }]), startedAt: now, runExpiresAt: later } });
      const state = await towerProgress(user.id, now);
      assert.equal(state.game.summary, 'Reward ready to claim'); assert.equal(state.game.progress?.current, 3);
      assert.equal(state.items.length, 1);
      assert.equal(state.game.facts?.tokenCount, 1);
      assert.deepEqual(state.game.facts?.tokenExpiries, [later.toISOString()]);
      assert.equal(state.game.facts?.rewardName, '30 minutes gaming');
      const snapshot = await getTowerProgressSnapshot(user.id, now);
      assert.ok(!JSON.stringify(snapshot.attempt).includes('redCards'));
      assert.ok(!JSON.stringify(snapshot.attempt).includes('cards'));
      await prisma.towerAttempt.update({ where: { id: attempt.id }, data: { runExpiresAt: now } });
      assert.equal((await towerProgress(user.id, now)).game.summary, 'Ready to climb');
      await setting('tower_enabled', 'false'); assert.equal((await towerProgress(user.id, now)).game.status, 'disabled'); await setting('tower_enabled', 'true');
    });
    await t.test('Guild Drop shows owned entries and latest published outcome, excluding drafts', async () => {
      for (const [suffix, status] of [['active', 'ACTIVE'], ['draft', 'DRAFT'], ['won', 'CLOSED']]) {
        const draw = await prisma.luckyDraw.create({ data: { id: `${prefix}-${suffix}`, title: `${suffix} draw`, prize: 'Gaming time', status,
          endsAt: now, ...(suffix === 'won' ? { winnerId: user.id, winnerPickedAt: now } : {}) } });
        await prisma.drawEntry.create({ data: { userId: user.id, drawId: draw.id } });
      }
      const state = await guildDropProgress(user.id, now);
      assert.ok(state.game.details.some((line) => line.includes('awaiting result')));
      assert.ok(state.game.details.some((line) => line.includes('you won')));
      assert.ok(!state.game.details.some((line) => line.includes('draft')));
    });
    await t.test('Watch Party shows invited events and settled own predictions without private events', async () => {
      for (const [suffix, status] of [['party', 'ACTIVE'], ['private', 'DRAFT'], ['settled', 'CLOSED']]) {
        const party = await prisma.watchParty.create({ data: { id: `${prefix}-${suffix}`, title: `${suffix} event`, homeTeam: 'A', awayTeam: 'B', kickoffAt: later, status,
          ...(suffix === 'settled' ? { predictionStatus: 'SETTLED', settledAt: now } : {}) } });
        await prisma.watchPartyInvite.create({ data: { partyId: party.id, userId: user.id } });
        if (suffix === 'settled') await prisma.watchPartyPrediction.create({ data: { userId: user.id, partyId: party.id, optionKey: 'HOME', optionLabel: 'A', stakeUnits: 100, payoutUnits: 200, status: 'WON' } });
      }
      const state = await watchPartyProgress(user.id, now);
      assert.equal(state.game.summary, '1 current event');
      assert.ok(state.game.details.some((line) => line.includes('20 EMIC credited')));
      assert.ok(!JSON.stringify(state).includes('private event'));
    });
    await t.test('Tournaments use account-linked registration and recorded matches only', async () => {
      const tournament = await prisma.tournament.create({ data: { id: `${prefix}-tournament`, name: 'Player tournament', date: '2026-10-01', status: 'ONGOING' } });
      const player = await prisma.tournamentPlayer.create({ data: { tournamentId: tournament.id, userId: user.id, name: 'Player' } });
      const rival = await prisma.tournamentPlayer.create({ data: { tournamentId: tournament.id, userId: other.id, name: 'Rival' } });
      await prisma.tournamentMatch.create({ data: { tournamentId: tournament.id, round: 1, matchIndex: 0, player1Id: player.id, player2Id: rival.id, winnerId: player.id, status: 'COMPLETED' } });
      await prisma.tournamentMatch.create({ data: { tournamentId: tournament.id, round: 2, matchIndex: 0, player1Id: player.id } });
      const current = await tournamentProgress(user.id);
      assert.ok(current.game.details.some((line) => line.includes('round 2 upcoming') && line.includes('1 recorded wins')));
      await prisma.tournament.update({ where: { id: tournament.id }, data: { status: 'FINISHED' } });
      assert.equal((await tournamentProgress(user.id)).game.status, 'completed');
    });
    await t.test('Vault reads leave account, game records, and settings untouched', async () => {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
      const rounds = await prisma.guess36Round.findMany({ orderBy: { roundDate: 'asc' } });
      const state = await getVaultState(user.id, now);
      assert.equal(state.games.length, 7); assert.ok(state.games.every((row) => row.status !== 'error'));
      assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: user.id } }), before);
      assert.deepEqual(await prisma.setting.findMany({ orderBy: { key: 'asc' } }), settings);
      assert.deepEqual(await prisma.guess36Round.findMany({ orderBy: { roundDate: 'asc' } }), rounds);
    });
  } finally {
    await prisma.tournament.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.watchParty.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.luckyDraw.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.guess36Round.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await prisma.lootItem.deleteMany({ where: { id: `${prefix}-loot` } });
    await prisma.setting.deleteMany({ where: { key: { notIn: settingsBefore.map((row) => row.key) } } });
    for (const row of settingsBefore) await prisma.setting.update({ where: { key: row.key }, data: { value: row.value } });
    await prisma.$disconnect();
  }
});
