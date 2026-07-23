import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureArmoryDefaults,
  getArmoryToday,
  grantAdminArmoryArtifact,
  parseAdminArtifactGrantRequest,
  pickAdminGrantArtifact,
} from '../../lib/armory';
import { prisma } from '../../lib/prisma';

const artifacts = [
  { id: 'armor', slotType: 'ARMOR', slotDropPercentage: 90 },
  { id: 'headgear', slotType: 'HEADGEAR', slotDropPercentage: 5 },
  { id: 'boots', slotType: 'BOOTS', slotDropPercentage: 1 },
  { id: 'gloves', slotType: 'GLOVES', slotDropPercentage: 4 },
];

test('admin artifact grant uses fixed slot boundaries', () => {
  const cases = [
    [0, 'boots'],
    [39, 'boots'],
    [40, 'gloves'],
    [69, 'gloves'],
    [70, 'armor'],
    [89, 'armor'],
    [90, 'headgear'],
    [99, 'headgear'],
  ] as const;

  for (const [roll, expectedId] of cases) {
    const selected = pickAdminGrantArtifact(artifacts, (minimum, maximum) => {
      assert.equal(minimum, 0);
      assert.equal(maximum, 100);
      return roll;
    });
    assert.equal(selected.id, expectedId);
  }
});

test('admin artifact grant produces the exact 40/30/20/10 distribution across all boundaries', () => {
  const counts = new Map<string, number>();
  for (let roll = 0; roll < 100; roll += 1) {
    const selected = pickAdminGrantArtifact(artifacts, () => roll);
    counts.set(selected.id, (counts.get(selected.id) ?? 0) + 1);
  }

  assert.deepEqual(Object.fromEntries(counts), {
    boots: 40,
    gloves: 30,
    armor: 20,
    headgear: 10,
  });
});

test('admin artifact grant requires exactly one active candidate for every slot', () => {
  assert.throws(
    () => pickAdminGrantArtifact(artifacts.slice(0, 3), () => 0),
    /INCOMPLETE_SET/,
  );
  assert.throws(
    () => pickAdminGrantArtifact([...artifacts.slice(0, 3), artifacts[0]], () => 0),
    /INCOMPLETE_SET/,
  );
});

test('admin grant request accepts only userId and setId', () => {
  assert.deepEqual(
    parseAdminArtifactGrantRequest({ userId: ' user-1 ', setId: ' gold-set ' }),
    { userId: 'user-1', setId: 'gold-set' },
  );
  assert.throws(
    () => parseAdminArtifactGrantRequest({
      userId: 'user-1',
      setId: 'gold-set',
      artifactId: 'gold-boots',
    }),
    /INVALID_GRANT_REQUEST/,
  );
  assert.throws(
    () => parseAdminArtifactGrantRequest({
      userId: 'user-1',
      setId: 'gold-set',
      slotType: 'BOOTS',
    }),
    /INVALID_GRANT_REQUEST/,
  );
});

test('admin grants update inventory and separate history without consuming Daily Forge', async () => {
  await ensureArmoryDefaults();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: 'Admin Grant Test User',
      email: `admin-grant-${suffix}@example.test`,
      password: 'test-only',
    },
  });

  try {
    const sets = await prisma.armorySet.findMany({
      where: {
        id: {
          in: ['iron_vanguard', 'silver_phantom', 'golden_titan', 'platinum_sovereign'],
        },
      },
      orderBy: { displayOrder: 'asc' },
    });
    assert.equal(sets.length, 4);

    for (const set of sets) {
      const grant = await grantAdminArmoryArtifact(user.id, set.id);
      assert.equal(grant.artifact.set.id, set.id);
      assert.match(grant.claimDate, new RegExp(`^${getArmoryToday()}:admin:`));
    }

    await grantAdminArmoryArtifact(user.id, sets[0].id);

    const [claims, inventory, dailyForgeClaim] = await Promise.all([
      prisma.armoryDailyClaim.findMany({ where: { userId: user.id } }),
      prisma.armoryInventory.aggregate({
        where: { userId: user.id },
        _sum: { quantity: true },
      }),
      prisma.armoryDailyClaim.findUnique({
        where: {
          userId_claimDate: {
            userId: user.id,
            claimDate: getArmoryToday(),
          },
        },
      }),
    ]);

    assert.equal(claims.length, 5);
    assert.ok(claims.every((claim) => claim.claimDate.includes(':admin:')));
    assert.equal(inventory._sum.quantity, 5);
    assert.equal(dailyForgeClaim, null);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test('admin grant rejects disabled and incomplete artifact sets', async () => {
  await ensureArmoryDefaults();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const setId = `admin_grant_test_${suffix}`;
  const user = await prisma.user.create({
    data: {
      name: 'Admin Grant Config Test User',
      email: `admin-grant-config-${suffix}@example.test`,
      password: 'test-only',
    },
  });
  await prisma.armorySet.create({
    data: {
      id: setId,
      name: 'Admin Grant Test Set',
      shortLabel: 'Test',
      rarity: 'GOLD',
      active: false,
    },
  });

  try {
    await assert.rejects(
      () => grantAdminArmoryArtifact(user.id, setId),
      /SET_NOT_AVAILABLE/,
    );

    await prisma.armorySet.update({ where: { id: setId }, data: { active: true } });
    await prisma.armoryArtifact.createMany({
      data: [
        { id: `${setId}_headgear`, setId, slotType: 'HEADGEAR', name: 'Test Headgear' },
        { id: `${setId}_armor`, setId, slotType: 'ARMOR', name: 'Test Armor' },
        { id: `${setId}_gloves`, setId, slotType: 'GLOVES', name: 'Test Gloves' },
        { id: `${setId}_boots`, setId, slotType: 'BOOTS', name: 'Test Boots', active: false },
      ],
    });

    await assert.rejects(
      () => grantAdminArmoryArtifact(user.id, setId),
      /INCOMPLETE_SET/,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.armorySet.delete({ where: { id: setId } });
  }
});
