import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../lib/prisma';
import {
  ARMORY_TRADE_DURATION_MS,
  armoryTradeExpiresAt,
  availableTradeCopies,
  isArmoryTradeExpired,
} from '../../lib/armory-marketplace-rules';
import {
  acceptArmoryTradeListing,
  adjustArmoryGuildGems,
  ArmoryMarketplaceError,
  cancelArmoryTradeListing,
  cancelArmoryTradeListingAsAdmin,
  createArmoryTradeListing,
  expireArmoryTradeListings,
  getArmoryMarketplaceAdminState,
  getArmoryMarketplaceConfig,
  getArmoryMarketplaceGemAccount,
  getArmoryMarketplaceState,
  searchArmoryMarketplaceGemUsers,
  updateArmoryMarketplaceConfig,
} from '../../lib/armory-marketplace';
import {
  claimArmorySet,
  ensureArmoryDefaults,
} from '../../lib/armory';

test('marketplace timing and equipped-copy rules are exact', () => {
  const now = new Date('2026-07-23T10:00:00.000Z');
  const expiry = armoryTradeExpiresAt(now);

  assert.equal(expiry.getTime() - now.getTime(), ARMORY_TRADE_DURATION_MS);
  assert.equal(isArmoryTradeExpired(expiry, now), false);
  assert.equal(isArmoryTradeExpired(expiry, expiry), true);
  assert.equal(availableTradeCopies(1, 'artifact-a', ['artifact-a']), 0);
  assert.equal(availableTradeCopies(2, 'artifact-a', ['artifact-a']), 1);
  assert.equal(availableTradeCopies(1, 'artifact-a', ['artifact-b']), 1);
});

test('cross-rarity trade, two-sided Gem debit, and expiry return are atomic', async () => {
  await ensureArmoryDefaults();
  const originalConfig = await getArmoryMarketplaceConfig();
  await updateArmoryMarketplaceConfig({
    enabled: true,
    gemCost: 1,
    durationHours: 24,
  });

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const seller = await prisma.user.create({
    data: {
      name: 'Marketplace Seller',
      email: `market-seller-${suffix}@example.test`,
      password: 'test-only',
      guildGems: 2,
    },
  });
  const buyer = await prisma.user.create({
    data: {
      name: 'Marketplace Buyer',
      email: `market-buyer-${suffix}@example.test`,
      password: 'test-only',
      guildGems: 1,
    },
  });

  try {
    const [bronze, platinum, spare] = await Promise.all([
      prisma.armoryArtifact.findFirstOrThrow({
        where: { set: { rarity: 'BRONZE' } },
        include: { set: true },
      }),
      prisma.armoryArtifact.findFirstOrThrow({
        where: { set: { rarity: 'PLATINUM' } },
        include: { set: true },
      }),
      prisma.armoryArtifact.findFirstOrThrow({
        where: { set: { rarity: 'SILVER' } },
        include: { set: true },
      }),
    ]);

    await Promise.all([
      prisma.armoryInventory.create({
        data: {
          userId: seller.id,
          artifactId: bronze.id,
          quantity: 1,
        },
      }),
      prisma.armoryInventory.create({
        data: {
          userId: seller.id,
          artifactId: spare.id,
          quantity: 1,
        },
      }),
      prisma.armoryInventory.create({
        data: {
          userId: buyer.id,
          artifactId: platinum.id,
          quantity: 1,
        },
      }),
    ]);

    const listing = await createArmoryTradeListing(
      seller.id,
      bronze.id,
      platinum.id,
    );
    assert.equal(listing.offeredArtifact.set.rarity, 'BRONZE');
    assert.equal(listing.requestedArtifact.set.rarity, 'PLATINUM');

    await assert.rejects(
      () => createArmoryTradeListing(seller.id, spare.id, platinum.id),
      (error: unknown) => (
        error instanceof ArmoryMarketplaceError
        && error.code === 'ACTIVE_LISTING_EXISTS'
      ),
    );

    await acceptArmoryTradeListing(buyer.id, listing.id);

    const [
      completed,
      sellerReceived,
      buyerReceived,
      sellerAfter,
      buyerAfter,
      gemEntries,
    ] = await Promise.all([
      prisma.armoryTradeListing.findUniqueOrThrow({ where: { id: listing.id } }),
      prisma.armoryInventory.findUniqueOrThrow({
        where: {
          userId_artifactId: {
            userId: seller.id,
            artifactId: platinum.id,
          },
        },
      }),
      prisma.armoryInventory.findUniqueOrThrow({
        where: {
          userId_artifactId: {
            userId: buyer.id,
            artifactId: bronze.id,
          },
        },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: seller.id },
        select: { guildGems: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: buyer.id },
        select: { guildGems: true },
      }),
      prisma.guildGemLedger.findMany({
        where: {
          userId: { in: [seller.id, buyer.id] },
          reason: 'MARKETPLACE_TRADE_FEE',
          referenceId: listing.id,
        },
      }),
    ]);

    assert.equal(completed.status, 'COMPLETED');
    assert.equal(sellerReceived.quantity, 1);
    assert.equal(buyerReceived.quantity, 1);
    assert.equal(sellerAfter.guildGems, 1);
    assert.equal(buyerAfter.guildGems, 0);
    assert.equal(gemEntries.length, 2);
    assert.ok(gemEntries.every((entry) => entry.amount === -1));
    assert.deepEqual(
      new Set(gemEntries.map((entry) => entry.userId)),
      new Set([seller.id, buyer.id]),
    );

    const expiring = await createArmoryTradeListing(
      seller.id,
      spare.id,
      bronze.id,
    );
    await Promise.all([
      prisma.user.update({
        where: { id: seller.id },
        data: { guildGems: 0 },
      }),
      prisma.user.update({
        where: { id: buyer.id },
        data: { guildGems: 1 },
      }),
    ]);
    await assert.rejects(
      () => acceptArmoryTradeListing(buyer.id, expiring.id),
      (error: unknown) => (
        error instanceof ArmoryMarketplaceError
        && error.code === 'SELLER_NOT_ENOUGH_GEMS'
      ),
    );
    const [stillOpen, buyerNotCharged] = await Promise.all([
      prisma.armoryTradeListing.findUniqueOrThrow({
        where: { id: expiring.id },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: buyer.id },
        select: { guildGems: true },
      }),
    ]);
    assert.equal(stillOpen.status, 'OPEN');
    assert.equal(buyerNotCharged.guildGems, 1);

    await Promise.all([
      prisma.user.update({
        where: { id: seller.id },
        data: { guildGems: 1 },
      }),
      prisma.user.update({
        where: { id: buyer.id },
        data: { guildGems: 0 },
      }),
    ]);
    await assert.rejects(
      () => acceptArmoryTradeListing(buyer.id, expiring.id),
      (error: unknown) => (
        error instanceof ArmoryMarketplaceError
        && error.code === 'NOT_ENOUGH_GEMS'
      ),
    );
    assert.equal(
      (await prisma.armoryTradeListing.findUniqueOrThrow({
        where: { id: expiring.id },
      })).status,
      'OPEN',
    );

    await prisma.armoryTradeListing.update({
      where: { id: expiring.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    assert.equal(
      await expireArmoryTradeListings({ listingId: expiring.id }),
      1,
    );

    const [expired, returned] = await Promise.all([
      prisma.armoryTradeListing.findUniqueOrThrow({ where: { id: expiring.id } }),
      prisma.armoryInventory.findUniqueOrThrow({
        where: {
          userId_artifactId: {
            userId: seller.id,
            artifactId: spare.id,
          },
        },
      }),
    ]);
    assert.equal(expired.status, 'EXPIRED');
    assert.equal(returned.quantity, 1);

    const state = await getArmoryMarketplaceState(seller.id);
    assert.equal(state.myListing, null);

    const cancellable = await createArmoryTradeListing(
      seller.id,
      spare.id,
      bronze.id,
    );
    await cancelArmoryTradeListing(seller.id, cancellable.id);
    const cancelled = await prisma.armoryTradeListing.findUniqueOrThrow({
      where: { id: cancellable.id },
    });
    assert.equal(cancelled.status, 'CANCELLED');

    await prisma.user.update({
      where: { id: seller.id },
      data: { guildGems: 0 },
    });
    await assert.rejects(
      () => createArmoryTradeListing(seller.id, spare.id, bronze.id),
      (error: unknown) => (
        error instanceof ArmoryMarketplaceError
        && error.code === 'NOT_ENOUGH_GEMS'
      ),
    );
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [seller.id, buyer.id] } },
    });
    await updateArmoryMarketplaceConfig(originalConfig);
  }
});

test('consuming a complete set awards exactly one Guild Gem', async () => {
  await ensureArmoryDefaults();

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: 'Gem Reward User',
      email: `market-gem-${suffix}@example.test`,
      password: 'test-only',
    },
  });

  try {
    const artifacts = await prisma.armoryArtifact.findMany({
      where: { setId: 'iron_vanguard' },
      orderBy: { displayOrder: 'asc' },
    });
    assert.equal(artifacts.length, 4);

    await Promise.all(artifacts.map((artifact) => (
      prisma.armoryInventory.create({
        data: {
          userId: user.id,
          artifactId: artifact.id,
          quantity: 1,
        },
      })
    )));

    const bySlot = new Map(
      artifacts.map((artifact) => [artifact.slotType, artifact.id]),
    );
    await prisma.armoryLoadout.create({
      data: {
        userId: user.id,
        headgearArtifactId: bySlot.get('HEADGEAR'),
        armorArtifactId: bySlot.get('ARMOR'),
        glovesArtifactId: bySlot.get('GLOVES'),
        bootsArtifactId: bySlot.get('BOOTS'),
      },
    });

    const result = await claimArmorySet(user.id);
    assert.equal(result.gemsEarned, 1);
    assert.equal(result.guildGems, 1);

    const [updatedUser, ledger] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { guildGems: true },
      }),
      prisma.guildGemLedger.findMany({
        where: {
          userId: user.id,
          reason: 'SET_CONSUMED',
          referenceId: result.ticket.id,
        },
      }),
    ]);
    assert.equal(updatedUser.guildGems, 1);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].amount, 1);
    assert.equal(ledger[0].balanceAfter, 1);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test('admin controls preserve listing snapshots and audit Gem adjustments', async () => {
  await ensureArmoryDefaults();
  const originalConfig = await getArmoryMarketplaceConfig();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [admin, seller, buyer] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Marketplace Admin',
        email: `market-admin-${suffix}@example.test`,
        password: 'test-only',
        role: 'ADMIN',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Admin Flow Seller',
        email: `admin-flow-seller-${suffix}@example.test`,
        password: 'test-only',
        guildGems: 3,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Admin Flow Buyer',
        email: `admin-flow-buyer-${suffix}@example.test`,
        password: 'test-only',
      },
    }),
  ]);

  try {
    const [bronze, platinum] = await Promise.all([
      prisma.armoryArtifact.findFirstOrThrow({
        where: { set: { rarity: 'BRONZE' } },
      }),
      prisma.armoryArtifact.findFirstOrThrow({
        where: { set: { rarity: 'PLATINUM' } },
      }),
    ]);
    await Promise.all([
      prisma.armoryInventory.create({
        data: {
          userId: seller.id,
          artifactId: bronze.id,
          quantity: 1,
        },
      }),
      prisma.armoryInventory.create({
        data: {
          userId: buyer.id,
          artifactId: platinum.id,
          quantity: 1,
        },
      }),
    ]);

    await updateArmoryMarketplaceConfig({
      enabled: true,
      gemCost: 3,
      durationHours: 48,
    });
    const listing = await createArmoryTradeListing(
      seller.id,
      bronze.id,
      platinum.id,
    );
    assert.equal(listing.gemCost, 3);
    const listingHours = (
      listing.expiresAt.getTime() - listing.createdAt.getTime()
    ) / 3_600_000;
    assert.ok(listingHours > 47.9 && listingHours < 48.1);

    await updateArmoryMarketplaceConfig({
      enabled: false,
      gemCost: 5,
      durationHours: 72,
    });
    const unchanged = await prisma.armoryTradeListing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    assert.equal(unchanged.gemCost, 3);
    assert.equal(unchanged.expiresAt.getTime(), listing.expiresAt.getTime());

    await assert.rejects(
      () => createArmoryTradeListing(seller.id, bronze.id, platinum.id),
      (error: unknown) => (
        error instanceof ArmoryMarketplaceError
        && error.code === 'MARKETPLACE_DISABLED'
      ),
    );
    await assert.rejects(
      () => acceptArmoryTradeListing(buyer.id, listing.id),
      (error: unknown) => (
        error instanceof ArmoryMarketplaceError
        && error.code === 'MARKETPLACE_DISABLED'
      ),
    );
    const userState = await getArmoryMarketplaceState(buyer.id);
    assert.equal(userState.marketplaceEnabled, false);
    assert.equal(userState.listings[0]?.canAccept, false);

    const adminState = await getArmoryMarketplaceAdminState({
      status: 'OPEN',
      search: seller.email,
      page: 1,
      limit: 20,
    });
    assert.equal(adminState.settings.enabled, false);
    assert.equal(adminState.pagination.total, 1);
    assert.equal(adminState.listings[0].id, listing.id);

    const cancellationResults = await Promise.allSettled([
      cancelArmoryTradeListingAsAdmin(listing.id),
      cancelArmoryTradeListingAsAdmin(listing.id),
    ]);
    assert.equal(
      cancellationResults.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      cancellationResults.filter((result) => (
        result.status === 'rejected'
        && result.reason instanceof ArmoryMarketplaceError
        && result.reason.code === 'LISTING_CLOSED'
      )).length,
      1,
    );
    const returned = await prisma.armoryInventory.findUniqueOrThrow({
      where: {
        userId_artifactId: {
          userId: seller.id,
          artifactId: bronze.id,
        },
      },
    });
    assert.equal(returned.quantity, 1);

    let account = await adjustArmoryGuildGems(
      admin.id,
      buyer.id,
      4,
      'Launch promotion',
    );
    assert.equal(account.guildGems, 4);
    account = await adjustArmoryGuildGems(
      admin.id,
      buyer.id,
      -3,
      'Counter correction',
    );
    assert.equal(account.guildGems, 1);
    await assert.rejects(
      () => adjustArmoryGuildGems(
        admin.id,
        buyer.id,
        -2,
        'Invalid negative balance',
      ),
      (error: unknown) => (
        error instanceof ArmoryMarketplaceError
        && error.code === 'NEGATIVE_GEM_BALANCE'
      ),
    );

    const [searchResults, gemAccount] = await Promise.all([
      searchArmoryMarketplaceGemUsers(buyer.email),
      getArmoryMarketplaceGemAccount(buyer.id),
    ]);
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0].guildGems, 1);
    assert.equal(gemAccount.ledger.length, 2);
    assert.equal(gemAccount.ledger[0].actor?.id, admin.id);
    assert.equal(gemAccount.ledger[0].note, 'Counter correction');
    assert.equal(gemAccount.ledger[0].balanceAfter, 1);
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [admin.id, seller.id, buyer.id] } },
    });
    await updateArmoryMarketplaceConfig(originalConfig);
  }
});
