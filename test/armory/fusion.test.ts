import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../lib/prisma';
import { ensureArmoryDefaults, getArmoryState, equipArtifact, craftArmoryArtifact, claimArmorySet } from '../../lib/armory';
import { fuseArtifacts, getFusionReceipt } from '../../lib/armory-fusion';
import { createArmoryTradeListing, updateArmoryMarketplaceConfig } from '../../lib/armory-marketplace';

test('fusion receipts, inventory protection, existing reward compatibility', async () => {
  await ensureArmoryDefaults();
  await prisma.setting.upsert({ where: { key: 'armory_fusion_enabled' }, create: { key: 'armory_fusion_enabled', value: 'true', label: 'Fusion' }, update: { value: 'true' } });
  const user = await prisma.user.create({ data: { name: 'Fusion test', email: `fusion-${Date.now()}@example.test`, password: 'test-only' } });
  const add = (id: string, n: number) => prisma.armoryInventory.upsert({ where: { userId_artifactId: { userId: user.id, artifactId: id } }, create: { userId: user.id, artifactId: id, quantity: n }, update: { quantity: n } });
  const count = async () => (await prisma.armoryInventory.aggregate({ where: { userId: user.id }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const gold = 'golden_titan_headgear', platinum = 'platinum_sovereign_boots';
  try {
    await add(gold, 3);
    const input = { requestId: 'fusion-request-00001', ingredients: [{ artifactId: gold, quantity: 3 }] };
    const before = await count();
    const [first, replay] = await Promise.all([fuseArtifacts(user.id, input), fuseArtifacts(user.id, input)]);
    assert.equal(first.output.id, replay.output.id);
    assert.equal(await count(), before - 2);
    assert.equal((await getFusionReceipt(user.id, input.requestId))?.output.id, first.output.id);
    assert.equal(await getFusionReceipt('another-user', input.requestId), null);
    await assert.rejects(() => fuseArtifacts(user.id, { ...input, chosenOutputId: platinum }), /CONFLICT/);
    await add(platinum, 3);
    await equipArtifact(user.id, 'BOOTS', platinum);
    const p = { requestId: 'fusion-request-00002', ingredients: [{ artifactId: platinum, quantity: 3 }], chosenOutputId: 'platinum_sovereign_headgear' };
    await assert.rejects(() => fuseArtifacts(user.id, p), /INVENTORY_CHANGED/);
    await equipArtifact(user.id, 'BOOTS', null);
    const chosen = await fuseArtifacts(user.id, p);
    assert.equal(chosen.output.id, p.chosenOutputId);
    await add(gold, 3);
    await assert.rejects(() => fuseArtifacts(user.id, { requestId: 'fusion-request-00003', ingredients: [{ artifactId: gold, quantity: 2 }, { artifactId: p.chosenOutputId, quantity: 1 }] }), /INVALID_FUSION/);
    const crafted = await craftArmoryArtifact(user.id, gold);
    assert.equal(crafted.crafted.id, p.chosenOutputId);
    for (const slot of ['headgear', 'armor', 'gloves', 'boots']) {
      const id = `iron_vanguard_${slot}`;
      await add(id, 1); await equipArtifact(user.id, slot.toUpperCase(), id);
    }
    await claimArmorySet(user.id);
    const afterClaim = await getArmoryState(user.id);
    assert.equal(afterClaim.inventory.filter(r => r.artifact.setId === 'iron_vanguard').length, 0);
    await prisma.setting.update({ where: { key: 'armory_fusion_enabled' }, data: { value: 'false' } });
    assert.equal((await fuseArtifacts(user.id, input)).output.id, first.output.id, 'receipts remain recoverable while disabled');
    await assert.rejects(() => fuseArtifacts(user.id, { ...input, requestId: 'fusion-request-00004' }), /DISABLED/);
  } finally { await prisma.user.delete({ where: { id: user.id } }); }
});

test('fusion uses uniform output indexing and rejects unavailable pools', async () => {
  await ensureArmoryDefaults();
  await prisma.setting.update({ where: { key: 'armory_fusion_enabled' }, data: { value: 'true' } });
  const user = await prisma.user.create({ data: { name: 'Pool test', email: `pool-${Date.now()}@example.test`, password: 'test-only' } });
  const id = 'iron_vanguard_boots';
  try {
    await prisma.armoryInventory.create({ data: { userId: user.id, artifactId: id, quantity: 30 } });
    const pool = await prisma.armoryArtifact.findMany({ where: { set: { rarity: 'SILVER' } }, orderBy: { id: 'asc' } });
    for (let index = 0; index < pool.length; index++) {
      let calls = 0;
      const result = await fuseArtifacts(user.id, { requestId: `uniform-request-000${index}`, ingredients: [{ artifactId: id, quantity: 3 }] }, max => { calls++; assert.equal(max, calls === 1 ? 100 : 4); return calls === 1 ? 60 : index; });
      assert.equal(result.output.id, pool[index].id);
    }
    await prisma.armoryArtifact.updateMany({ where: { set: { rarity: 'PLATINUM' } }, data: { active: false } });
    await assert.rejects(() => fuseArtifacts(user.id, { requestId: 'unavailable-pool-00001', ingredients: [{ artifactId: id, quantity: 3 }] }), /POOL_UNAVAILABLE/);
  } finally {
    await prisma.armoryArtifact.updateMany({ where: { set: { rarity: 'PLATINUM' } }, data: { active: true } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test('competing fusion, upgrade, equip and exchange cannot overspend or leave equipment unowned', async () => {
  await ensureArmoryDefaults();
  await updateArmoryMarketplaceConfig({ enabled: true, gemCost: 1, durationHours: 24 });
  for (const competitor of ['fusion', 'craft', 'equip', 'exchange']) {
    const user = await prisma.user.create({ data: { name: 'Race test', email: `race-${competitor}-${Date.now()}@example.test`, password: 'test-only', guildGems: 5 } });
    const id = 'iron_vanguard_headgear';
    try {
      await prisma.armoryInventory.create({ data: { userId: user.id, artifactId: id, quantity: 3 } });
      const input = { requestId: `race-first-request-${competitor}`, ingredients: [{ artifactId: id, quantity: 3 }] };
      const other = () => competitor === 'fusion'
        ? fuseArtifacts(user.id, { ...input, requestId: `race-other-request-${competitor}` }, max => max === 100 ? 99 : 0)
        : competitor === 'craft' ? craftArmoryArtifact(user.id, id)
        : competitor === 'equip' ? equipArtifact(user.id, 'HEADGEAR', id)
        : createArmoryTradeListing(user.id, id, 'silver_phantom_boots');
      const results = await Promise.allSettled([fuseArtifacts(user.id, input, () => 0), other()]);
      assert.ok(results.some(r => r.status === 'fulfilled'));
      const inventory = await prisma.armoryInventory.findMany({ where: { userId: user.id } });
      assert.ok(inventory.every(r => r.quantity >= 0));
      const loadout = await prisma.armoryLoadout.findUnique({ where: { userId: user.id } });
      if (loadout?.headgearArtifactId) assert.ok(inventory.some(r => r.artifactId === loadout.headgearArtifactId && r.quantity > 0));
      assert.ok(await prisma.armoryFusionReceipt.count({ where: { userId: user.id } }) <= 1);
      assert.ok(inventory.reduce((sum, row) => sum + row.quantity, 0) <= 3);
    } finally { await prisma.user.delete({ where: { id: user.id } }); }
  }
});
