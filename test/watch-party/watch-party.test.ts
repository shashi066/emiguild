import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../lib/prisma';
import {
  archiveCompletedWatchParties,
  cancelWatchPartyInvite,
  cancelWatchPartyShopOrder,
  checkInWatchPartyInvite,
  createWatchParty,
  enterWatchParty,
  getAdminWatchPartyState,
  getAdminWatchPartyShopOrders,
  getWatchPartyShop,
  inviteWatchPartyUsers,
  markWatchPartyShopOrderGiven,
  purchaseWatchPartyShopOrder,
  settleWatchParty,
  stopWatchPartyPredictions,
  submitWatchPartyPrediction,
  voidWatchParty,
  WatchPartyError,
} from '../../lib/watch-party';

const DAY = 24 * 60 * 60 * 1000;

async function cleanup(suffix: string) {
  await prisma.watchParty.deleteMany({
    where: { title: { contains: suffix } },
  });
  await prisma.user.deleteMany({
    where: { email: { contains: suffix } },
  });
}

async function makeUsers(suffix: string) {
  const [admin, user] = await Promise.all([
    prisma.user.create({
      data: {
        name: `Watch Admin ${suffix}`,
        email: `watch-admin-${suffix}@test.local`,
        password: 'test-password',
        role: 'ADMIN',
      },
    }),
    prisma.user.create({
      data: {
        name: `Watch User ${suffix}`,
        email: `watch-user-${suffix}@test.local`,
        password: 'test-password',
        role: 'USER',
      },
    }),
  ]);
  return { admin, user };
}

async function makeParty(adminId: string, suffix: string, input: Record<string, unknown> = {}) {
  return createWatchParty(adminId, {
    title: `Lite Watch Party ${suffix}`,
    homeTeam: 'Leeds United',
    awayTeam: 'Ipswich Town',
    kickoffAt: new Date(Date.now() + DAY).toISOString(),
    venue: 'Guild TV',
    entryFeeRupees: 100,
    entryCoins: 100,
    status: 'ACTIVE',
    ...input,
  });
}

function hasWatchPartyCode(code: string) {
  return (error: unknown) => error instanceof WatchPartyError && error.code === code;
}

test('interprets admin datetime-local kickoff as IST before storage', async () => {
  const suffix = `ist-kickoff-${Date.now()}`;
  await cleanup(suffix);
  const { admin } = await makeUsers(suffix);

  try {
    const party = await createWatchParty(admin.id, {
      title: `IST Kickoff ${suffix}`,
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      kickoffAt: '2026-08-10T20:00',
      venue: 'Guild TV',
      entryFeeRupees: 100,
      entryCoins: 100,
      status: 'ACTIVE',
    });

    assert.equal(party.kickoffAt, '2026-08-10T14:30:00.000Z');
    assert.equal(party.predictionLockAt, '2026-08-10T14:30:00.000Z');
  } finally {
    await cleanup(suffix);
  }
});

test('invite, check-in, entry credit, prediction debit, and settlement are atomic', async () => {
  const suffix = `flow-${Date.now()}`;
  await cleanup(suffix);
  const { admin, user } = await makeUsers(suffix);

  try {
    const party = await makeParty(admin.id, suffix);

    await assert.rejects(
      enterWatchParty(user.id, party.id),
      hasWatchPartyCode('INVITE_REQUIRED'),
    );

    await inviteWatchPartyUsers(admin.id, party.id, [user.id]);
    await assert.rejects(
      enterWatchParty(user.id, party.id),
      hasWatchPartyCode('CHECKIN_REQUIRED'),
    );
    await assert.rejects(
      submitWatchPartyPrediction(user.id, party.id, 'HOME', 10),
      hasWatchPartyCode('ENTRY_REQUIRED'),
    );

    await checkInWatchPartyInvite(admin.id, party.id, user.id);
    await checkInWatchPartyInvite(admin.id, party.id, user.id);

    const creditedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { watchPartyCoins: true },
    });
    assert.equal(creditedUser.watchPartyCoins, 1000);

    const creditRows = await prisma.watchPartyCoinLedger.count({
      where: { userId: user.id, partyId: party.id, reason: 'ENTRY_CREDIT' },
    });
    assert.equal(creditRows, 1);

    const entered = await enterWatchParty(user.id, party.id);
    assert.equal(entered.invite.entered, true);

    const afterEnterUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { watchPartyCoins: true },
    });
    assert.equal(afterEnterUser.watchPartyCoins, 1000);

    const predicted = await submitWatchPartyPrediction(user.id, party.id, 'HOME', 10);
    assert.equal(predicted.walletCoins, 90);
    assert.equal(predicted.prediction?.optionKey, 'HOME');
    assert.equal(predicted.prediction?.stakeCoins, 10);

    const settled = await settleWatchParty(admin.id, party.id, 'HOME');
    assert.equal(settled.predictionStatus, 'SETTLED');
    assert.equal(settled.settledOption, 'HOME');

    const finalUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { watchPartyCoins: true },
    });
    assert.equal(finalUser.watchPartyCoins, 1100);

    const prediction = await prisma.watchPartyPrediction.findUniqueOrThrow({
      where: { partyId_userId: { partyId: party.id, userId: user.id } },
    });
    assert.equal(prediction.status, 'WON');
    assert.equal(prediction.payoutUnits, 200);
  } finally {
    await cleanup(suffix);
  }
});

test('admin can cancel pending watch party invites before check-in', async () => {
  const suffix = `cancel-invite-${Date.now()}`;
  await cleanup(suffix);
  const { admin, user } = await makeUsers(suffix);

  try {
    const party = await makeParty(admin.id, suffix);
    const invited = await inviteWatchPartyUsers(admin.id, party.id, [user.id]);
    assert.equal(invited.invites.length, 1);

    const cancelled = await cancelWatchPartyInvite(admin.id, party.id, user.id);
    assert.equal(cancelled.invites.length, 0);

    await assert.rejects(
      enterWatchParty(user.id, party.id),
      hasWatchPartyCode('INVITE_REQUIRED'),
    );

    await inviteWatchPartyUsers(admin.id, party.id, [user.id]);
    await checkInWatchPartyInvite(admin.id, party.id, user.id);
    await assert.rejects(
      cancelWatchPartyInvite(admin.id, party.id, user.id),
      hasWatchPartyCode('INVITE_ALREADY_USED'),
    );
  } finally {
    await cleanup(suffix);
  }
});

test('prediction amount validation blocks invalid or unaffordable token amounts', async () => {
  const suffix = `amount-${Date.now()}`;
  await cleanup(suffix);
  const { admin, user } = await makeUsers(suffix);

  try {
    const party = await makeParty(admin.id, suffix);
    await inviteWatchPartyUsers(admin.id, party.id, [user.id]);
    await checkInWatchPartyInvite(admin.id, party.id, user.id);
    await enterWatchParty(user.id, party.id);

    await assert.rejects(
      submitWatchPartyPrediction(user.id, party.id, 'HOME', 0),
      hasWatchPartyCode('INVALID_COIN_AMOUNT'),
    );
    await assert.rejects(
      submitWatchPartyPrediction(user.id, party.id, 'HOME', 101),
      hasWatchPartyCode('INSUFFICIENT_TOKENS'),
    );

    const userAfterFailedPredictions = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { watchPartyCoins: true },
    });
    assert.equal(userAfterFailedPredictions.watchPartyCoins, 1000);

    const predictionCount = await prisma.watchPartyPrediction.count({
      where: { partyId: party.id, userId: user.id },
    });
    assert.equal(predictionCount, 0);
  } finally {
    await cleanup(suffix);
  }
});

test('prediction lock timing blocks late predictions', async () => {
  const suffix = `lock-${Date.now()}`;
  await cleanup(suffix);
  const { admin, user } = await makeUsers(suffix);

  try {
    const party = await makeParty(admin.id, suffix, {
      predictionLockAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await inviteWatchPartyUsers(admin.id, party.id, [user.id]);
    await checkInWatchPartyInvite(admin.id, party.id, user.id);
    await enterWatchParty(user.id, party.id);

    await assert.rejects(
      submitWatchPartyPrediction(user.id, party.id, 'AWAY', 5),
      hasWatchPartyCode('PREDICTION_LOCKED'),
    );
  } finally {
    await cleanup(suffix);
  }
});

test('admin can stop predictions before settlement', async () => {
  const suffix = `stop-${Date.now()}`;
  await cleanup(suffix);
  const { admin, user } = await makeUsers(suffix);

  try {
    const party = await makeParty(admin.id, suffix);
    await inviteWatchPartyUsers(admin.id, party.id, [user.id]);
    await checkInWatchPartyInvite(admin.id, party.id, user.id);
    await enterWatchParty(user.id, party.id);

    const stopped = await stopWatchPartyPredictions(admin.id, party.id);
    assert.equal(stopped.predictionStatus, 'CLOSED');

    await assert.rejects(
      submitWatchPartyPrediction(user.id, party.id, 'HOME', 5),
      hasWatchPartyCode('PREDICTION_LOCKED'),
    );

    const settled = await settleWatchParty(admin.id, party.id, 'HOME');
    assert.equal(settled.predictionStatus, 'SETTLED');
    assert.equal(settled.settledOption, 'HOME');
  } finally {
    await cleanup(suffix);
  }
});

test('admin can bulk archive settled and void watch parties without hiding live ones', async () => {
  const suffix = `archive-complete-${Date.now()}`;
  await cleanup(suffix);
  const { admin } = await makeUsers(suffix);

  try {
    const liveParty = await makeParty(admin.id, `${suffix}-live`);
    const settledParty = await makeParty(admin.id, `${suffix}-settled`);
    const voidPartyRow = await makeParty(admin.id, `${suffix}-void`);

    await settleWatchParty(admin.id, settledParty.id, 'HOME');
    await voidWatchParty(admin.id, voidPartyRow.id);

    const result = await archiveCompletedWatchParties({ titleContains: suffix });
    assert.equal(result.success, true);
    assert.equal(result.archivedCount >= 2, true);

    const rows = await prisma.watchParty.findMany({
      where: { title: { contains: suffix } },
      select: { id: true, status: true },
    });
    const byId = new Map(rows.map((party) => [party.id, party.status]));
    assert.equal(byId.get(liveParty.id), 'ACTIVE');
    assert.equal(byId.get(settledParty.id), 'ARCHIVED');
    assert.equal(byId.get(voidPartyRow.id), 'ARCHIVED');
  } finally {
    await cleanup(suffix);
  }
});

test('admin watch party state paginates newest records without duplicates', async () => {
  const suffix = `admin-page-${Date.now()}`;
  await cleanup(suffix);
  const { admin } = await makeUsers(suffix);

  try {
    await makeParty(admin.id, `${suffix}-one`);
    await makeParty(admin.id, `${suffix}-two`);
    await makeParty(admin.id, `${suffix}-three`);

    const firstPage = await getAdminWatchPartyState({ take: 1 });
    assert.equal(firstPage.parties.length, 1);
    assert.equal(firstPage.pageInfo.take, 1);
    assert.equal(firstPage.pageInfo.hasMore, true);
    assert.equal(typeof firstPage.parties[0].createdAt, 'string');

    const secondPage = await getAdminWatchPartyState({
      skip: firstPage.pageInfo.nextSkip,
      take: 1,
    });
    assert.equal(secondPage.parties.length, 1);
    assert.notEqual(secondPage.parties[0].id, firstPage.parties[0].id);
  } finally {
    await cleanup(suffix);
  }
});

test('watch party shop returns pass, guild, and drink items', async () => {
  const suffix = `shop-items-${Date.now()}`;
  await cleanup(suffix);
  const { user } = await makeUsers(suffix);

  try {
    const shop = await getWatchPartyShop(user.id);
    const byKey = new Map(shop.items.map((item) => [item.itemKey, item]));
    assert.equal(shop.orders.length, 0);
    assert.equal(byKey.get('BRONZE')?.tokenCost, 1300);
    assert.equal(byKey.get('GUILD_HERO')?.tokenCost, 499);
    assert.equal(byKey.get('GUILD_HERO')?.itemType, 'GUILD_MEMBERSHIP');
    assert.equal(byKey.get('GUILD_MASTER')?.tokenCost, 999);
    assert.equal(byKey.get('DRINK_125')?.itemType, 'DRINK');
    assert.equal(byKey.get('DRINK_20')?.tokenCost, 20);
  } finally {
    await cleanup(suffix);
  }
});

test('watch party shop orders debit tokens and can be marked given without assigning pass', async () => {
  const suffix = `shop-given-${Date.now()}`;
  await cleanup(suffix);
  const { admin, user } = await makeUsers(suffix);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { watchPartyCoins: 50000 },
    });

    const beforePassCount = await prisma.userPass.count({ where: { userId: user.id } });
    const shop = await purchaseWatchPartyShopOrder(user.id, 'GUILD_HERO');
    assert.equal(shop.walletCoins, 4501);
    assert.equal(shop.orders.length, 1);
    assert.equal(shop.orders[0].label, 'Guild Hero');
    assert.equal(shop.orders[0].itemType, 'GUILD_MEMBERSHIP');
    assert.equal(shop.orders[0].status, 'PENDING');

    const order = await prisma.watchPartyShopOrder.findUniqueOrThrow({
      where: { id: shop.orders[0].id },
    });
    assert.equal(order.status, 'PENDING');
    assert.equal(order.itemKey, 'GUILD_HERO');
    assert.equal(order.tokenCost, 499);
    assert.equal(order.tokenCostUnits, 4990);

    const afterPurchasePassCount = await prisma.userPass.count({ where: { userId: user.id } });
    assert.equal(afterPurchasePassCount, beforePassCount);

    const pending = await getAdminWatchPartyShopOrders();
    assert.equal(pending.orders.some((item) => item.id === order.id), true);

    const given = await markWatchPartyShopOrderGiven(admin.id, order.id);
    assert.equal(given.status, 'GIVEN');

    const givenOrder = await prisma.watchPartyShopOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    assert.equal(givenOrder.status, 'GIVEN');
    assert.equal(Boolean(givenOrder.givenAt), true);
    assert.equal(givenOrder.givenById, admin.id);

    const afterGivenPassCount = await prisma.userPass.count({ where: { userId: user.id } });
    assert.equal(afterGivenPassCount, beforePassCount);

    const afterGivenQueue = await getAdminWatchPartyShopOrders();
    assert.equal(afterGivenQueue.orders.some((item) => item.id === order.id), false);
  } finally {
    await cleanup(suffix);
  }
});

test('admin shop order queue paginates pending tickets without duplicates', async () => {
  const suffix = `shop-page-${Date.now()}`;
  await cleanup(suffix);
  const { user } = await makeUsers(suffix);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { watchPartyCoins: 50000 },
    });

    await purchaseWatchPartyShopOrder(user.id, 'DRINK_20');
    await purchaseWatchPartyShopOrder(user.id, 'DRINK_40');

    const firstPage = await getAdminWatchPartyShopOrders({ take: 1 });
    assert.equal(firstPage.orders.length, 1);
    assert.equal(firstPage.pageInfo.take, 1);
    assert.equal(firstPage.pageInfo.hasMore, true);

    const secondPage = await getAdminWatchPartyShopOrders({
      skip: firstPage.pageInfo.nextSkip,
      take: 1,
    });
    assert.equal(secondPage.orders.length, 1);
    assert.notEqual(secondPage.orders[0].id, firstPage.orders[0].id);
  } finally {
    await cleanup(suffix);
  }
});

test('watch party shop order cancellation refunds once', async () => {
  const suffix = `shop-cancel-${Date.now()}`;
  await cleanup(suffix);
  const { admin, user } = await makeUsers(suffix);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { watchPartyCoins: 1250 },
    });

    const shop = await purchaseWatchPartyShopOrder(user.id, 'DRINK_125');
    assert.equal(shop.walletCoins, 0);
    const orderId = shop.orders[0].id;

    const cancelled = await cancelWatchPartyShopOrder(admin.id, orderId);
    assert.equal(cancelled.status, 'CANCELLED');

    const refundedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { watchPartyCoins: true },
    });
    assert.equal(refundedUser.watchPartyCoins, 1250);

    await assert.rejects(
      cancelWatchPartyShopOrder(admin.id, orderId),
      hasWatchPartyCode('SHOP_ORDER_NOT_PENDING'),
    );

    const refundRows = await prisma.watchPartyCoinLedger.count({
      where: { userId: user.id, reason: 'SHOP_ORDER_REFUND' },
    });
    assert.equal(refundRows, 1);
  } finally {
    await cleanup(suffix);
  }
});

test('watch party shop order purchase requires enough tokens', async () => {
  const suffix = `shop-funds-${Date.now()}`;
  await cleanup(suffix);
  const { user } = await makeUsers(suffix);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { watchPartyCoins: 4989 },
    });

    await assert.rejects(
      purchaseWatchPartyShopOrder(user.id, 'GUILD_HERO'),
      hasWatchPartyCode('INSUFFICIENT_TOKENS'),
    );

    const orders = await prisma.watchPartyShopOrder.count({
      where: { userId: user.id },
    });
    assert.equal(orders, 0);
  } finally {
    await cleanup(suffix);
  }
});

test('voiding refunds active prediction stakes once', async () => {
  const suffix = `void-${Date.now()}`;
  await cleanup(suffix);
  const { admin, user } = await makeUsers(suffix);

  try {
    const party = await makeParty(admin.id, suffix);
    await inviteWatchPartyUsers(admin.id, party.id, [user.id]);
    await checkInWatchPartyInvite(admin.id, party.id, user.id);
    await enterWatchParty(user.id, party.id);
    await submitWatchPartyPrediction(user.id, party.id, 'AWAY', 25);

    const afterStake = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { watchPartyCoins: true },
    });
    assert.equal(afterStake.watchPartyCoins, 750);

    const voided = await voidWatchParty(admin.id, party.id);
    assert.equal(voided.predictionStatus, 'VOID');

    const afterVoid = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { watchPartyCoins: true },
    });
    assert.equal(afterVoid.watchPartyCoins, 1000);

    const prediction = await prisma.watchPartyPrediction.findUniqueOrThrow({
      where: { partyId_userId: { partyId: party.id, userId: user.id } },
    });
    assert.equal(prediction.status, 'VOID');
    assert.equal(prediction.payoutUnits, 250);

    await voidWatchParty(admin.id, party.id);
    const afterSecondVoid = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { watchPartyCoins: true },
    });
    assert.equal(afterSecondVoid.watchPartyCoins, 1000);
  } finally {
    await cleanup(suffix);
  }
});
