const test = require('node:test');
const assert = require('node:assert/strict');

const SLOTS = ['HEADGEAR', 'ARMOR', 'GLOVES', 'BOOTS'];

function validateDropPercentages(sets) {
  const total = sets
    .filter((set) => set.active !== false)
    .reduce((sum, set) => sum + Number(set.dropPercentage || 0), 0);
  return total === 100;
}

function pickWeightedSet(sets, randomInt) {
  const total = sets.reduce((sum, set) => sum + set.dropPercentage, 0);
  const roll = randomInt(0, total);
  let cursor = 0;
  for (const set of sets) {
    cursor += set.dropPercentage;
    if (roll < cursor) return set;
  }
  return sets[0];
}

function validateSlotWeights(artifacts) {
  const totals = artifacts.reduce((map, artifact) => {
    if (artifact.active === false) return map;
    map[artifact.setId] = (map[artifact.setId] || 0) + Number(artifact.slotDropPercentage || 0);
    return map;
  }, {});
  return Object.values(totals).every((total) => total === 100);
}

function pickWeightedArtifact(artifacts, randomInt) {
  const total = artifacts.reduce((sum, artifact) => sum + artifact.slotDropPercentage, 0);
  const roll = randomInt(0, total);
  let cursor = 0;
  for (const artifact of artifacts) {
    cursor += artifact.slotDropPercentage;
    if (roll < cursor) return artifact;
  }
  return artifacts[0];
}

function detectCompleteSet(loadout) {
  const equipped = SLOTS.map((slot) => loadout[slot]).filter(Boolean);
  if (equipped.length !== 4) return null;
  const setId = equipped[0].setId;
  return equipped.every((artifact) => artifact.setId === setId) ? setId : null;
}

function nextCraftRarity(rarity) {
  return {
    BRONZE: 'SILVER',
    SILVER: 'GOLD',
    GOLD: 'PLATINUM',
  }[rarity] || null;
}

test('Armory drop percentages must total 100 across active sets', () => {
  assert.equal(validateDropPercentages([
    { dropPercentage: 55, active: true },
    { dropPercentage: 28, active: true },
    { dropPercentage: 13, active: true },
    { dropPercentage: 4, active: true },
  ]), true);

  assert.equal(validateDropPercentages([
    { dropPercentage: 55, active: true },
    { dropPercentage: 28, active: true },
    { dropPercentage: 13, active: true },
    { dropPercentage: 10, active: false },
  ]), false);
});

test('Armory weighted roll maps random ranges to the correct set', () => {
  const sets = [
    { id: 'bronze', dropPercentage: 55 },
    { id: 'silver', dropPercentage: 28 },
    { id: 'gold', dropPercentage: 13 },
    { id: 'platinum', dropPercentage: 4 },
  ];

  assert.equal(pickWeightedSet(sets, () => 0).id, 'bronze');
  assert.equal(pickWeightedSet(sets, () => 54).id, 'bronze');
  assert.equal(pickWeightedSet(sets, () => 55).id, 'silver');
  assert.equal(pickWeightedSet(sets, () => 82).id, 'silver');
  assert.equal(pickWeightedSet(sets, () => 83).id, 'gold');
  assert.equal(pickWeightedSet(sets, () => 95).id, 'gold');
  assert.equal(pickWeightedSet(sets, () => 96).id, 'platinum');
});

test('Armory slot weights must total 100 inside each active set', () => {
  assert.equal(validateSlotWeights([
    { setId: 'iron_vanguard', slotDropPercentage: 25, active: true },
    { setId: 'iron_vanguard', slotDropPercentage: 25, active: true },
    { setId: 'iron_vanguard', slotDropPercentage: 25, active: true },
    { setId: 'iron_vanguard', slotDropPercentage: 25, active: true },
    { setId: 'silver_phantom', slotDropPercentage: 50, active: true },
    { setId: 'silver_phantom', slotDropPercentage: 50, active: true },
  ]), true);

  assert.equal(validateSlotWeights([
    { setId: 'iron_vanguard', slotDropPercentage: 25, active: true },
    { setId: 'iron_vanguard', slotDropPercentage: 25, active: true },
    { setId: 'iron_vanguard', slotDropPercentage: 25, active: true },
    { setId: 'iron_vanguard', slotDropPercentage: 10, active: true },
  ]), false);
});

test('Armory slot weighted roll maps random ranges to the correct artifact', () => {
  const artifacts = [
    { id: 'headgear', slotDropPercentage: 40 },
    { id: 'armor', slotDropPercentage: 30 },
    { id: 'gloves', slotDropPercentage: 20 },
    { id: 'boots', slotDropPercentage: 10 },
  ];

  assert.equal(pickWeightedArtifact(artifacts, () => 0).id, 'headgear');
  assert.equal(pickWeightedArtifact(artifacts, () => 39).id, 'headgear');
  assert.equal(pickWeightedArtifact(artifacts, () => 40).id, 'armor');
  assert.equal(pickWeightedArtifact(artifacts, () => 69).id, 'armor');
  assert.equal(pickWeightedArtifact(artifacts, () => 70).id, 'gloves');
  assert.equal(pickWeightedArtifact(artifacts, () => 89).id, 'gloves');
  assert.equal(pickWeightedArtifact(artifacts, () => 90).id, 'boots');
});

test('Armory set completion requires all four slots from the same set', () => {
  const full = {
    HEADGEAR: { setId: 'iron_vanguard' },
    ARMOR: { setId: 'iron_vanguard' },
    GLOVES: { setId: 'iron_vanguard' },
    BOOTS: { setId: 'iron_vanguard' },
  };
  const mixed = {
    HEADGEAR: { setId: 'iron_vanguard' },
    ARMOR: { setId: 'silver_phantom' },
    GLOVES: { setId: 'iron_vanguard' },
    BOOTS: { setId: 'iron_vanguard' },
  };

  assert.equal(detectCompleteSet(full), 'iron_vanguard');
  assert.equal(detectCompleteSet(mixed), null);
  assert.equal(detectCompleteSet({ ...full, BOOTS: null }), null);
});

test('Armory crafting upgrades three same artifacts to the next rarity only', () => {
  assert.equal(nextCraftRarity('BRONZE'), 'SILVER');
  assert.equal(nextCraftRarity('SILVER'), 'GOLD');
  assert.equal(nextCraftRarity('GOLD'), 'PLATINUM');
  assert.equal(nextCraftRarity('PLATINUM'), null);
});
