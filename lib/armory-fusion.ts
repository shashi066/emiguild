import crypto from 'crypto';
import { prisma } from './prisma';
import { armoryTransaction } from './armory-transaction';
import { FUSION_ODDS, FUSION_VERSION, normalizeFusion, rollFusionTier, type FusionTier } from './armory-fusion-rules';

export async function getFusionReceipt(userId: string, requestId: string) {
  const receipt = await prisma.armoryFusionReceipt.findUnique({ where: { userId_requestId: { userId, requestId } } });
  return receipt ? { requestId, output: JSON.parse(receipt.outputSnapshot), oddsVersion: receipt.oddsVersion, createdAt: receipt.createdAt } : null;
}

export async function fuseArtifacts(userId: string, value: unknown, randomInt: (max: number) => number = crypto.randomInt) {
  const input = normalizeFusion(value);
  const payload = JSON.stringify({ ingredients: input.ingredients, chosenOutputId: input.chosenOutputId ?? null });
  return armoryTransaction(async tx => {
    const previous = await tx.armoryFusionReceipt.findUnique({ where: { userId_requestId: { userId, requestId: input.requestId } } });
    if (previous) {
      if (previous.payload !== payload) throw new Error('FUSION_REQUEST_CONFLICT');
      console.info('Armory fusion receipt replay', { userId, requestId: input.requestId });
      return { requestId: input.requestId, output: JSON.parse(previous.outputSnapshot), oddsVersion: previous.oddsVersion };
    }
    const enabled = await tx.setting.findUnique({ where: { key: 'armory_fusion_enabled' } });
    if (enabled?.value !== 'true') throw new Error('FUSION_DISABLED');
    const artifacts = await tx.armoryArtifact.findMany({ where: { active: true, set: { active: true } }, include: { set: true }, orderBy: { id: 'asc' } });
    const ingredients = input.ingredients.map(item => ({ ...item, artifact: artifacts.find(a => a.id === item.artifactId) }));
    const tier = ingredients[0].artifact?.set.rarity as FusionTier;
    if (!FUSION_ODDS[tier] || ingredients.some(item => !item.artifact || item.artifact.set.rarity !== tier)) throw new Error('INVALID_FUSION');
    if (Object.keys(FUSION_ODDS[tier]).some(t => !artifacts.some(a => a.set.rarity === t))) throw new Error('FUSION_POOL_UNAVAILABLE');
    if (tier !== 'PLATINUM' && input.chosenOutputId) throw new Error('INVALID_FUSION');
    const outputTier = rollFusionTier(tier, randomInt(100));
    const pool = artifacts.filter(a => a.set.rarity === outputTier);
    const output = tier === 'PLATINUM' ? pool.find(a => a.id === input.chosenOutputId) : pool[randomInt(pool.length)];
    if (!output) throw new Error('CHOOSE_PLATINUM');
    const loadout = await tx.armoryLoadout.findUnique({ where: { userId } });
    const equipped = [loadout?.headgearArtifactId, loadout?.armorArtifactId, loadout?.glovesArtifactId, loadout?.bootsArtifactId];
    for (const ingredient of ingredients) {
      const reserved = equipped.filter(id => id === ingredient.artifactId).length;
      const changed = await tx.armoryInventory.updateMany({ where: { userId, artifactId: ingredient.artifactId, quantity: { gte: ingredient.quantity + reserved } }, data: { quantity: { decrement: ingredient.quantity } } });
      if (changed.count !== 1) throw new Error('FUSION_INVENTORY_CHANGED');
    }
    await tx.armoryInventory.upsert({ where: { userId_artifactId: { userId, artifactId: output.id } }, create: { userId, artifactId: output.id, quantity: 1 }, update: { quantity: { increment: 1 } } });
    // Store only public result fields, never internal forge weighting configuration.
    const snapshot = { id: output.id, name: output.name, slotType: output.slotType, setId: output.setId, rarity: output.set.rarity };
    await tx.armoryFusionReceipt.create({ data: { userId, requestId: input.requestId, payload, outputArtifactId: output.id, outputSnapshot: JSON.stringify(snapshot), oddsVersion: FUSION_VERSION, inputTier: tier, outputTier } });
    return { requestId: input.requestId, output: snapshot, oddsVersion: FUSION_VERSION };
  });
}
