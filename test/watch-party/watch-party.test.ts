import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../lib/prisma';
import {
  archiveCompletedWatchParties,
  cancelWatchPartyInvite,
  cancelWatchPartyShopOrder,
  checkInWatchPartyInvite,
  coinUnitsFromCoins,
  createWatchParty,
  DEFAULT_WATCH_PARTY_ENTRY_COINS,
  DEFAULT_WATCH_PARTY_ENTRY_COIN_UNITS,
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
  updateWatchParty,
  voidWatchParty,
  WatchPartyError,
} from '../../lib/watch-party';
import { buildWatchPartyInviteEmail } from '../../lib/notify';

const DAY = 24 * 60 * 60 * 1000;

test('builds a safe Watch Party invite email with event details and optional Fan Pick copy', () => {
  const email = buildWatchPartyInviteEmail({
    customerName: '<Guild Member>',
    customerEmail: 'member@example.test',
    partyId: 'party/id',
    title: 'Arsenal <Final>\r\nNight',
    homeTeam: 'Arsenal & Co',
    awayTeam: '<Chelsea>',
    kickoffAt: '2026-08-15T14:30:00.000Z',
    venue: 'EmiGuild <Main>',
  });

  assert.equal(email.subject, "You're invited: Arsenal <Final> Night");
  assert.match(email.html, /Hi &lt;Guild Member&gt;/);
  assert.match(email.html, /Arsenal &amp; Co vs &lt;Chelsea&gt;/);
  assert.match(email.html, /15 August 2026.*8:00 pm.*IST/i);
  assert.match(email.html, /EmiGuild &lt;Main&gt;/);
  assert.match(email.html, /\/watch-party\/party%2Fid/);
  assert.match(email.html, /optional Fan Pick activity/i);
  assert.match(email.html, />OPEN WATCH PARTY</);
  assert.doesNotMatch(email.html, /prediction|predict|odds|stake|payout|bet|wager|gambl/i);
  assert.doesNotMatch(email.html, /Entry fee|at the counter|₹|rupee|&#8377;/i);
  assert.doesNotMatch(email.html, /Emicoins|EMIC|Check-in reward/i);
  assert.doesNotMatch(email.html, /<Guild Member>|<Chelsea>|<Main>/);
});

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

function hasWatchPartyError(code: string, message: string) {
  return (error: unknown) => (
    error instanceof WatchPartyError
    && error.code === code
    && error.message === message
  );
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

test('new watch parties default to 500 EMIC and sport-neutral Fan Pick options', async () => {
  const suffix = `defaults-${Date.now()}`;
  await cleanup(suffix);
  const { admin } = await makeUsers(suffix);

  try {
    const party = await createWatchParty(admin.id, {
      title: `Cricket Night ${suffix}`,
      homeTeam: 'India',
      awayTeam: 'Australia',
      kickoffAt: new Date(Date.now() + DAY).toISOString(),
      status: 'ACTIVE',
    });
    const row = await prisma.watchParty.findUniqueOrThrow({ where: { id: party.id } });

    assert.equal(DEFAULT_WATCH_PARTY_ENTRY_COINS, 500);
    assert.equal(DEFAULT_WATCH_PARTY_ENTRY_COIN_UNITS, 5000);
    assert.equal(row.entryCoins, 500);
    assert.equal(row.entryCoinUnits, 5000);
    assert.deepEqual(
      party.options.map((option) => [option.key, option.label, option.multiplierBasisPoints]),
      [
        ['HOME', 'India', 20_000],
        ['DRAW', 'Draw / Tie', 30_000],
        ['AWAY', 'Australia', 20_000],
      ],
    );
  } finally {
    await cleanup(suffix);
  }
});

test('Fan Pick EMIC limits allow 100,000 and retain the stable validation code', () => {
  assert.equal(coinUnitsFromCoins(100_000), 1_000_000);
  const invalidAmount = hasWatchPartyError(
    'INVALID_COIN_AMOUNT',
    'Enter an amount between 1 and 100,000 EMIC.',
  );
  assert.throws(() => coinUnitsFromCoins(0.1), invalidAmount);
  assert.throws(() => coinUnitsFromCoins(100_000.1), invalidAmount);
});

test('editing imported team names clears stale Premier League metadata', async () => {
  const suffix = `manual-event-${Date.now()}`;
  await cleanup(suffix);
  const { admin } = await makeUsers(suffix);

  try {
    const imported = await createWatchParty(admin.id, {
      title: `Imported Event ${suffix}`,
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      kickoffAt: new Date(Date.now() + DAY).toISOString(),
      source: 'LOCAL_PL',
      providerMatchId: 'pl-123',
      providerCompetitionCode: 'PL',
      providerSeason: 2026,
      providerPayload: { fixture: 'original' },
    });

    await updateWatchParty(imported.id, { homeTeam: 'India' });
    const updated = await prisma.watchParty.findUniqueOrThrow({ where: { id: imported.id } });

    assert.equal(updated.homeTeam, 'India');
    assert.equal(updated.source, 'MANUAL');
    assert.equal(updated.providerMatchId, null);
    assert.equal(updated.providerCompetitionCode, null);
    assert.equal(updated.providerSeason, null);
    assert.equal(updated.providerPayload, null);
  } finally {
    await cleanup(suffix);
  }
});

test('the service preserves the existing two-option Fan Pick API contract', async () => {
  const suffix = `option-compat-${Date.now()}`;
  await cleanup(suffix);
  const { admin } = await makeUsers(suffix);

  try {
    const party = await createWatchParty(admin.id, {
      title: `Legacy Options ${suffix}`,
      homeTeam: 'Legacy A',
      awayTeam: 'Legacy B',
      kickoffAt: new Date(Date.now() + DAY).toISOString(),
      predictionOptions: [
        { key: 'YES', label: 'Yes', multiplierBasisPoints: 17_500 },
        { key: 'NO', label: 'No', multiplierBasisPoints: 21_000 },
      ],
    });

    assert.deepEqual(party.options.map((option) => option.key), ['YES', 'NO']);
  } finally {
    await cleanup(suffix);
  }
});

test('the service rejects invalid reward multiplier basis points with a stable code', async () => {
  const baseInput = {
    title: 'Invalid reward multiplier should never be stored',
    homeTeam: 'Team A',
    awayTeam: 'Team B',
    kickoffAt: new Date(Date.now() + DAY).toISOString(),
  };

  for (const multiplierBasisPoints of [9_999, 100_001, 17_500.5]) {
    await assert.rejects(
      createWatchParty('invalid-reward-admin', {
        ...baseInput,
        predictionOptions: [
          { key: 'HOME', label: 'Team A', multiplierBasisPoints },
          { key: 'AWAY', label: 'Team B', multiplierBasisPoints: 20_000 },
        ],
      }),
      hasWatchPartyError(
        'INVALID_MULTIPLIER',
        'Reward multiplier must be between 1× and 10×.',
      ),
    );
  }

  await assert.rejects(
    createWatchParty('missing-options-admin', {
      ...baseInput,
      predictionOptions: [],
    }),
    hasWatchPartyError(
      'INVALID_PREDICTION_OPTIONS',
      'Add at least two Fan Pick options.',
    ),
  );
});

test('invite, check-in, entry credit, Fan Pick debit, and result finalization are atomic', async () => {
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
      hasWatchPartyError(
        'ENTRY_REQUIRED',
        'Enter this watch party before making a Fan Pick.',
      ),
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

test('custom reward multipliers are snapshotted and determine the correct EMIC reward', async () => {
  const suffix = `custom-reward-${Date.now()}`;
  await cleanup(suffix);
  const { admin, user } = await makeUsers(suffix);

  try {
    const party = await makeParty(admin.id, suffix, {
      homeTeam: 'India',
      awayTeam: 'Australia',
      predictionOptions: [
        { key: 'HOME', label: 'India', multiplierBasisPoints: 22_500 },
        { key: 'DRAW', label: 'Draw / Tie', multiplierBasisPoints: 30_000 },
        { key: 'AWAY', label: 'Australia', multiplierBasisPoints: 18_500 },
      ],
    });
    await inviteWatchPartyUsers(admin.id, party.id, [user.id]);
    await checkInWatchPartyInvite(admin.id, party.id, user.id);
    await enterWatchParty(user.id, party.id);

    const submitted = await submitWatchPartyPrediction(user.id, party.id, 'HOME', 25);
    assert.equal(submitted.prediction?.multiplier, '2.25x');

    await assert.rejects(
      submitWatchPartyPrediction(user.id, party.id, 'HOME', 25),
      hasWatchPartyError(
        'ALREADY_PREDICTED',
        'You already confirmed a Fan Pick for this event.',
      ),
    );

    await settleWatchParty(admin.id, party.id, 'HOME');
    const [prediction, finalUser] = await Promise.all([
      prisma.watchPartyPrediction.findUniqueOrThrow({
        where: { partyId_userId: { partyId: party.id, userId: user.id } },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { watchPartyCoins: true },
      }),
    ]);

    assert.equal(prediction.multiplierBasisPoints, 22_500);
    assert.equal(prediction.stakeUnits, 250);
    assert.equal(prediction.payoutUnits, 562);
    assert.equal(finalUser.watchPartyCoins, 1312);
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

test('Fan Pick amount validation blocks invalid or unaffordable EMIC amounts', async () => {
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
      hasWatchPartyError(
        'INVALID_COIN_AMOUNT',
        'Enter an amount between 1 and 100,000 EMIC.',
      ),
    );
    await assert.rejects(
      submitWatchPartyPrediction(user.id, party.id, 'HOME', 101),
      hasWatchPartyError(
        'INSUFFICIENT_TOKENS',
        'Your EMIC balance is lower than the selected amount.',
      ),
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

test('Fan Pick close timing blocks late selections with a stable error code', async () => {
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
      hasWatchPartyError('PREDICTION_LOCKED', 'Fan Picks are closed for this event.'),
    );
  } finally {
    await cleanup(suffix);
  }
});

test('admin can close Fan Picks before finalizing the result', async () => {
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
      hasWatchPartyError('PREDICTION_LOCKED', 'Fan Picks are closed for this event.'),
    );

    await assert.rejects(
      settleWatchParty(admin.id, party.id, 'MISSING'),
      hasWatchPartyError('OPTION_NOT_FOUND', 'Result option not found.'),
    );

    const settled = await settleWatchParty(admin.id, party.id, 'HOME');
    assert.equal(settled.predictionStatus, 'SETTLED');
    assert.equal(settled.settledOption, 'HOME');

    await assert.rejects(
      stopWatchPartyPredictions(admin.id, party.id),
      hasWatchPartyError(
        'PARTY_SETTLED',
        'The result for this watch party is already final.',
      ),
    );
    await assert.rejects(
      voidWatchParty(admin.id, party.id),
      hasWatchPartyError(
        'PARTY_SETTLED',
        'Completed Fan Picks cannot be cancelled.',
      ),
    );
  } finally {
    await cleanup(suffix);
  }
});

test('admin can bulk archive finalized and cancelled watch parties without hiding live ones', async () => {
  const suffix = `archive-complete-${Date.now()}`;
  await cleanup(suffix);
  const { admin } = await makeUsers(suffix);

  try {
    const liveParty = await makeParty(admin.id, `${suffix}-live`);
    const settledParty = await makeParty(admin.id, `${suffix}-settled`);
    const voidPartyRow = await makeParty(admin.id, `${suffix}-void`);

    await settleWatchParty(admin.id, settledParty.id, 'HOME');
    await voidWatchParty(admin.id, voidPartyRow.id);

    const result = await archiveCompletedWatchParties({ titleContains: suffix.toUpperCase() });
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
    assert.equal(byKey.get('BRONZE')?.tokenCost, 13_000);
    assert.equal(byKey.get('SILVER')?.tokenCost, 23_000);
    assert.equal(byKey.get('GOLD')?.tokenCost, 30_000);
    assert.equal(byKey.get('BLACK')?.tokenCost, 24_000);
    assert.equal(byKey.get('APEX')?.tokenCost, 31_500);
    assert.equal(byKey.get('GUILD_HERO')?.tokenCost, 4_990);
    assert.equal(byKey.get('GUILD_HERO')?.itemType, 'GUILD_MEMBERSHIP');
    assert.equal(byKey.get('GUILD_MASTER')?.tokenCost, 9_990);
    assert.equal(byKey.get('DRINK_125')?.tokenCost, 1_250);
    assert.equal(byKey.get('DRINK_60')?.tokenCost, 600);
    assert.equal(byKey.get('DRINK_40')?.tokenCost, 400);
    assert.equal(byKey.get('DRINK_125')?.itemType, 'DRINK');
    assert.equal(byKey.get('DRINK_20')?.tokenCost, 200);
  } finally {
    await cleanup(suffix);
  }
});

test('watch party shop orders debit EMIC and can be marked given without assigning pass', async () => {
  const suffix = `shop-given-${Date.now()}`;
  await cleanup(suffix);
  const { admin, user } = await makeUsers(suffix);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { watchPartyCoins: 100000 },
    });

    const beforePassCount = await prisma.userPass.count({ where: { userId: user.id } });
    const shop = await purchaseWatchPartyShopOrder(user.id, 'GUILD_HERO');
    assert.equal(shop.walletCoins, 5010);
    assert.equal(shop.orders.length, 1);
    assert.equal(shop.orders[0].label, 'Guild Hero');
    assert.equal(shop.orders[0].itemType, 'GUILD_MEMBERSHIP');
    assert.equal(shop.orders[0].status, 'PENDING');

    const order = await prisma.watchPartyShopOrder.findUniqueOrThrow({
      where: { id: shop.orders[0].id },
    });
    assert.equal(order.status, 'PENDING');
    assert.equal(order.itemKey, 'GUILD_HERO');
    assert.equal(order.tokenCost, 4990);
    assert.equal(order.tokenCostUnits, 49900);

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
    await assert.rejects(
      cancelWatchPartyShopOrder(admin.id, `${suffix}-missing`),
      hasWatchPartyError('SHOP_ORDER_NOT_FOUND', 'EMIC redemption not found.'),
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { watchPartyCoins: 12500 },
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
    assert.equal(refundedUser.watchPartyCoins, 12500);

    await assert.rejects(
      cancelWatchPartyShopOrder(admin.id, orderId),
      hasWatchPartyError(
        'SHOP_ORDER_NOT_PENDING',
        'This EMIC redemption is no longer pending.',
      ),
    );

    const refundRows = await prisma.watchPartyCoinLedger.count({
      where: { userId: user.id, reason: 'SHOP_ORDER_REFUND' },
    });
    assert.equal(refundRows, 1);
  } finally {
    await cleanup(suffix);
  }
});

test('watch party shop order purchase requires enough EMIC', async () => {
  const suffix = `shop-funds-${Date.now()}`;
  await cleanup(suffix);
  const { user } = await makeUsers(suffix);

  try {
    await assert.rejects(
      purchaseWatchPartyShopOrder(user.id, 'NOT_A_REWARD'),
      hasWatchPartyError('INVALID_SHOP_ITEM', 'Choose a valid EMIC reward.'),
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { watchPartyCoins: 49899 },
    });

    await assert.rejects(
      purchaseWatchPartyShopOrder(user.id, 'GUILD_HERO'),
      hasWatchPartyError(
        'INSUFFICIENT_TOKENS',
        'Your EMIC balance is too low to redeem this item.',
      ),
    );

    const orders = await prisma.watchPartyShopOrder.count({
      where: { userId: user.id },
    });
    assert.equal(orders, 0);
  } finally {
    await cleanup(suffix);
  }
});

test('cancelling an event restores active Fan Pick amounts once', async () => {
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

    await assert.rejects(
      stopWatchPartyPredictions(admin.id, party.id),
      hasWatchPartyError(
        'PARTY_VOID',
        'Fan Picks for this watch party were cancelled and EMIC was restored.',
      ),
    );

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
