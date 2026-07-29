import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureArmoryDefaults,
  forgeArtifact,
  getArmoryState,
  getArmoryToday,
} from '../../lib/armory';
import { prisma } from '../../lib/prisma';

test('Daily Forge stays server-locked after a claim and rejects a duplicate reward', async () => {
  await ensureArmoryDefaults();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: 'Daily Forge Security Test',
      email: `daily-forge-${suffix}@example.test`,
      password: 'test-only',
    },
  });

  try {
    const before = await getArmoryState(user.id);
    assert.equal(before.forge.canForge, true);
    assert.equal(typeof before.serverNow, 'string');
    assert.equal(typeof before.forge.nextResetAt, 'string');

    const firstClaim = await forgeArtifact(user.id);
    assert.equal(firstClaim.todayClaim.claimDate, getArmoryToday());

    const after = await getArmoryState(user.id);
    assert.equal(after.forge.canForge, false);
    assert.equal(after.forge.claimedToday, true);
    assert.equal(after.forge.reason, 'claimed');

    await assert.rejects(
      () => forgeArtifact(user.id),
      /ALREADY_FORGED/,
    );

    const [dailyClaims, inventory] = await Promise.all([
      prisma.armoryDailyClaim.count({
        where: {
          userId: user.id,
          claimDate: firstClaim.todayClaim.claimDate,
        },
      }),
      prisma.armoryInventory.aggregate({
        where: { userId: user.id },
        _sum: { quantity: true },
      }),
    ]);

    assert.equal(dailyClaims, 1);
    assert.equal(inventory._sum.quantity, 1);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
