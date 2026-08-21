import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../lib/prisma';
import { checkInBookingWithArtifact, getArmoryState, getArmoryToday, redeemArmoryTicket } from '../../lib/armory';
import {
  DEFAULT_TOWER_REWARDS,
  TowerError,
  claimTowerReward,
  continueTowerAttempt,
  getTowerAdminHistory,
  getTowerCurrent,
  getTowerHomePrompt,
  getTowerTokenExpiry,
  grantManualTowerToken,
  grantTowerToken,
  isTowerTokenExpired,
  normalizeTowerRewards,
  pickTowerCard,
  searchTowerUsers,
  startTowerAttempt,
  updateTowerAdminConfig,
} from '../../lib/tower';

const baseNow = new Date('2030-08-20T12:00:00.000Z');
const oneHour = 60 * 60 * 1000;

function towerCardId(attemptId: string, level: number, slot: 'A' | 'B' | 'C') {
  const secret = process.env.TOWER_CARD_SECRET || process.env.AUTH_SECRET || 'tower-dev-secret';
  const digest = crypto.createHmac('sha256', secret).update(`${attemptId}:${level}:${slot}`).digest('base64url').slice(0, 14);
  return `card_${digest}`;
}

function assertActivePrivacy(value: unknown) {
  const json = JSON.stringify(value);
  assert.ok(Buffer.byteLength(json, 'utf8') < 10_000, 'active Tower response exceeded 10 KB');
  for (const privateField of [
    'redCards', 'resolvedPicks', 'cardSlot', 'redPosition', 'tokenId', 'checkInId', 'sourceRefId',
    'startedAt', 'securedLevel', '"code"',
  ]) {
    assert.equal(json.includes(privateField), false, `${privateField} leaked during active play`);
  }
  const record = value as { attemptId?: string; attempt?: Record<string, unknown> };
  const attempt = record.attemptId ? record as Record<string, unknown> : record.attempt;
  assert.equal(attempt ? Object.hasOwn(attempt, 'rewardTicket') : false, false, 'attempt-level reward ticket leaked');
  assert.ok(Buffer.byteLength(json, 'utf8') < 10_000, 'Tower response exceeded 10 KB');
}

function assertTerminalReveal(value: { reveal?: Array<{ level: number; redPosition: number }> }) {
  assert.equal(value.reveal?.length, 10);
  assert.deepEqual(value.reveal?.map((row) => row.level), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(value.reveal?.every((row) => row.redPosition >= 0 && row.redPosition <= 2));
  const json = JSON.stringify(value);
  assert.equal(json.includes('redCards'), false);
  assert.equal(json.includes('cardSlot'), false);
  assert.equal(json.includes('resolvedPicks'), false);
}

test('Tower Tokens expire at the exclusive end of the next IST calendar day', () => {
  const earlyFridayIst = new Date('2026-08-20T18:31:00.000Z');
  const lateFridayIst = new Date('2026-08-21T18:20:00.000Z');
  const earlyExpiry = getTowerTokenExpiry(earlyFridayIst);
  const lateExpiry = getTowerTokenExpiry(lateFridayIst);
  assert.equal(earlyExpiry.toISOString(), '2026-08-22T18:30:00.000Z');
  assert.equal(lateExpiry.toISOString(), '2026-08-22T18:30:00.000Z');
  assert.equal(isTowerTokenExpired(lateExpiry, new Date('2026-08-22T18:29:59.999Z')), false);
  assert.equal(isTowerTokenExpired(lateExpiry, new Date('2026-08-22T18:30:00.000Z')), true);
});

test('Tower Token inventory, attempts, admin, banner, and Reward Ticket flows', async (suite) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const users = await Promise.all(['Owner', 'Inventory', 'Loss', 'Complete', 'Expiry', 'Timeout', 'Banner'].map((name) => prisma.user.create({
    data: { name: `Tower ${name} ${suffix}`, email: `tower-${name.toLowerCase()}-${suffix}@example.test`, password: 'test-only' },
  })));
  const [owner, inventoryUser, lossUser, completeUser, expiryUser, timeoutUser, bannerUser] = users;
  const admin = await prisma.user.create({
    data: { name: `Tower Admin ${suffix}`, email: `tower-admin-${suffix}@example.test`, password: 'test-only', role: 'ADMIN' },
  });
  const station = await prisma.station.create({
    data: { name: `Tower Station ${suffix}`, description: 'Test', specs: 'Test', hourlyRate: 100 },
  });
  let bookingCounter = 0;
  const booking = (
    userId: string | null,
    status = 'CHECKED_IN',
    checkedInAt: Date | null = status === 'CHECKED_IN' ? baseNow : null,
  ) => prisma.booking.create({
    data: {
      userId,
      stationId: station.id,
      date: '2030-08-20',
      startTime: '10:00',
      endTime: '11:00',
      duration: 1,
      totalPrice: 100,
      status,
      checkedInAt,
      notes: `tower-test-${bookingCounter += 1}`,
    },
  });

  try {
    await updateTowerAdminConfig({ enabled: true, rewards: DEFAULT_TOWER_REWARDS });

    await suite.test('strictly validates all ten configured rewards', () => {
      assert.equal(normalizeTowerRewards(DEFAULT_TOWER_REWARDS).length, 10);
      assert.throws(() => normalizeTowerRewards(DEFAULT_TOWER_REWARDS.slice(0, 9)), /INVALID_TOWER_CONFIG/);
      assert.throws(() => normalizeTowerRewards(DEFAULT_TOWER_REWARDS.map((row) => ({ ...row, level: 1 }))), /INVALID_TOWER_CONFIG/);
      assert.throws(() => normalizeTowerRewards(DEFAULT_TOWER_REWARDS.map((row) => row.level === 5 ? { ...row, value: 101 } : row)), /INVALID_TOWER_CONFIG/);
      assert.throws(() => normalizeTowerRewards(DEFAULT_TOWER_REWARDS.map((row) => row.level === 10 ? { ...row, value: undefined } : row)), /INVALID_TOWER_CONFIG/);
      assert.throws(() => normalizeTowerRewards(DEFAULT_TOWER_REWARDS.map((row) => row.level === 10 ? { ...row, passType: 'UNKNOWN' } : row)), /INVALID_TOWER_CONFIG/);
    });

    await suite.test('one booking grants one immutable token and enforces ownership', async () => {
      const checkedIn = await booking(owner.id);
      const first = await grantTowerToken(checkedIn.id, { id: owner.id, role: 'USER' });
      await prisma.booking.update({ where: { id: checkedIn.id }, data: { notes: 'updated after grant' } });
      const retry = await grantTowerToken(checkedIn.id, { id: owner.id, role: 'USER' });

      assert.equal(first.created, true);
      assert.equal(retry.created, false);
      assert.equal(retry.token.id, first.token.id);
      assert.equal(first.token.source, 'CHECK_IN');
      assert.equal(first.token.sourceRefId, `CHECK_IN:${checkedIn.id}`);
      assert.equal(first.token.earnedAt.toISOString(), baseNow.toISOString());
      assert.equal(first.token.expiresAt.toISOString(), getTowerTokenExpiry(baseNow).toISOString());
      assert.equal(retry.token.expiresAt.toISOString(), first.token.expiresAt.toISOString());
      assert.equal(first.token.grantedById, null);

      await assert.rejects(
        () => grantTowerToken(checkedIn.id, { id: lossUser.id, role: 'USER' }),
        (error: TowerError) => error.code === 'FORBIDDEN',
      );
      const pending = await booking(owner.id, 'CONFIRMED');
      await assert.rejects(
        () => grantTowerToken(pending.id, { id: owner.id }),
        (error: TowerError) => error.code === 'INVALID_CHECKIN',
      );
      const unlinked = await booking(null, 'CONFIRMED', null);
      const firstUnlinkedCheckIn = await checkInBookingWithArtifact(unlinked.id);
      const retriedUnlinkedCheckIn = await checkInBookingWithArtifact(unlinked.id);
      assert.ok(firstUnlinkedCheckIn.booking.checkedInAt);
      assert.equal(
        retriedUnlinkedCheckIn.booking.checkedInAt?.toISOString(),
        firstUnlinkedCheckIn.booking.checkedInAt?.toISOString(),
      );
      await assert.rejects(
        () => grantTowerToken(unlinked.id, { id: admin.id, role: 'ADMIN' }),
        (error: TowerError) => error.code === 'NO_LINKED_USER',
      );
      const foreign = await booking(owner.id);
      await assert.rejects(
        () => grantTowerToken(foreign.id, { id: lossUser.id }),
        (error: TowerError) => error.code === 'FORBIDDEN',
      );
    });

    await suite.test('two bookings create two tokens and earliest expiry is consumed first', async () => {
      const firstCheckIn = await booking(inventoryUser.id, 'CHECKED_IN', baseNow);
      const secondEarnedAt = new Date(baseNow.getTime() + 24 * oneHour);
      const inventoryNow = secondEarnedAt;
      const secondCheckIn = await booking(inventoryUser.id, 'CHECKED_IN', secondEarnedAt);
      const firstGrant = await grantTowerToken(firstCheckIn.id, { id: admin.id, role: 'ADMIN' });
      const secondGrant = await grantTowerToken(secondCheckIn.id, { id: admin.id, role: 'ADMIN' });
      const inventory = await getTowerCurrent(inventoryUser.id, inventoryNow);

      assert.equal(inventory.availableTokens, 2);
      assert.equal(inventory.nextTokenExpiresAt, firstGrant.token.expiresAt.toISOString());
      assert.notEqual(firstGrant.token.id, secondGrant.token.id);
      assert.notEqual(firstGrant.token.expiresAt.toISOString(), secondGrant.token.expiresAt.toISOString());

      const firstRun = await startTowerAttempt(inventoryUser.id, inventoryNow);
      const restored = await startTowerAttempt(inventoryUser.id, inventoryNow);
      assert.equal(restored.attemptId, firstRun.attemptId);
      const storedFirstRun = await prisma.towerAttempt.findUniqueOrThrow({ where: { id: firstRun.attemptId } });
      assert.equal(storedFirstRun.tokenId, firstGrant.token.id);
      assert.equal((await getTowerCurrent(inventoryUser.id, inventoryNow)).availableTokens, 1);

      await prisma.towerAttempt.update({
        where: { id: firstRun.attemptId },
        data: { redCards: JSON.stringify(Array(10).fill('A')) },
      });
      const loss = await pickTowerCard(inventoryUser.id, firstRun.attemptId, firstRun.cards[0].id, inventoryNow);
      assert.equal(loss.attempt.status, 'LOST');

      const secondRun = await startTowerAttempt(inventoryUser.id, inventoryNow);
      assert.notEqual(secondRun.attemptId, firstRun.attemptId);
      const storedSecondRun = await prisma.towerAttempt.findUniqueOrThrow({ where: { id: secondRun.attemptId } });
      assert.equal(storedSecondRun.tokenId, secondGrant.token.id);
      assert.equal((await getTowerCurrent(inventoryUser.id, inventoryNow)).availableTokens, 0);
    });

    await suite.test('manual grants deduplicate retries while deliberate requests add tokens', async () => {
      await assert.rejects(
        () => grantManualTowerToken(owner.id, `request-${suffix}-unauthorized`, lossUser.id, baseNow),
        (error: TowerError) => error.code === 'FORBIDDEN',
      );
      const first = await grantManualTowerToken(owner.id, `request-${suffix}-1`, admin.id, baseNow);
      const retry = await grantManualTowerToken(owner.id, `request-${suffix}-1`, admin.id, new Date(baseNow.getTime() + oneHour));
      const second = await grantManualTowerToken(owner.id, `request-${suffix}-2`, admin.id, new Date(baseNow.getTime() + oneHour));

      assert.equal(first.created, true);
      assert.equal(retry.created, false);
      assert.equal(retry.token.id, first.token.id);
      assert.equal(retry.token.expiresAt.toISOString(), first.token.expiresAt.toISOString());
      assert.notEqual(second.token.id, first.token.id);
      assert.equal(first.token.source, 'ADMIN');
      assert.equal(first.token.grantedById, admin.id);
      assert.equal(first.token.expiresAt.toISOString(), getTowerTokenExpiry(baseNow).toISOString());
      assert.equal(second.token.expiresAt.toISOString(), getTowerTokenExpiry(new Date(baseNow.getTime() + oneHour)).toISOString());

      const found = await searchTowerUsers(`owner ${suffix}`);
      assert.ok(found.length <= 10);
      assert.ok(found.some((user) => user.id === owner.id));
    });

    await suite.test('active response stays private and a safe floor can be cashed out', async () => {
      const first = await startTowerAttempt(owner.id, baseNow);
      const second = await startTowerAttempt(owner.id, baseNow);
      assert.equal(first.attemptId, second.attemptId);
      assert.equal(first.floors.length, 10);
      assert.equal(first.cards.length, 3);
      assertActivePrivacy(first);
      assertActivePrivacy(await getTowerCurrent(owner.id, baseNow));

      await prisma.towerAttempt.update({
        where: { id: first.attemptId },
        data: { redCards: JSON.stringify(Array(10).fill('A')) },
      });
      const safeCard = first.cards[1].id;
      const safe = await pickTowerCard(owner.id, first.attemptId, safeCard, baseNow);
      const duplicate = await pickTowerCard(owner.id, first.attemptId, safeCard, baseNow);
      assert.equal(safe.result, 'SAFE');
      assert.deepEqual(duplicate, safe);
      assert.equal(safe.attempt.canClaim, true);
      assert.equal(safe.attempt.cards.length, 0);
      assert.equal(safe.attempt.history.length, 1);
      assertActivePrivacy(safe);
      const restoredDecision = await getTowerCurrent(owner.id, baseNow);
      assert.equal(restoredDecision.attempt?.canClaim, true);
      assert.equal(restoredDecision.attempt?.cards.length, 0);
      await assert.rejects(
        () => pickTowerCard(owner.id, first.attemptId, first.cards[2].id, baseNow),
        (error: TowerError) => error.code === 'INVALID_CARD',
      );
      await assert.rejects(
        () => pickTowerCard(owner.id, first.attemptId, towerCardId(first.attemptId, 2, 'B'), baseNow),
        (error: TowerError) => error.code === 'CLIMB_DECISION_REQUIRED',
      );
      await assert.rejects(
        () => pickTowerCard(lossUser.id, first.attemptId, first.cards[1].id, baseNow),
        (error: TowerError) => error.code === 'FORBIDDEN',
      );

      const consumed = await prisma.towerAttempt.findUniqueOrThrow({
        where: { id: first.attemptId },
        include: { token: true },
      });
      const claimNow = new Date(consumed.runExpiresAt.getTime() - 1);
      const [claim, retry] = await Promise.all([
        claimTowerReward(owner.id, first.attemptId, claimNow),
        claimTowerReward(owner.id, first.attemptId, claimNow),
      ]);
      assert.equal(retry.ticket.id, claim.ticket.id);
      assert.equal(claim.ticket.expiresAt.toISOString(), consumed.token.expiresAt.toISOString());
      assert.match(claim.ticket.code, /^TWR-[A-F0-9]{24}$/);
      assert.equal(claim.attempt.status, 'CLAIMED');
      assertTerminalReveal(claim.attempt);
      const recoveredClaim = await getTowerCurrent(owner.id, baseNow, { recoveryAttemptId: first.attemptId });
      assert.equal(recoveredClaim.attempt?.status, 'CLAIMED');
      assertTerminalReveal(recoveredClaim.attempt!);
      const secondVisibleTicket = await prisma.armoryTicket.create({
        data: {
          userId: owner.id,
          rewardSnapshot: JSON.stringify({
            source: 'Tower of Rewards', rewardId: 'tower-extra', rewardType: 'RACING_TIME',
            description: '20 Minutes Racing', value: 20, racingMinutes: 20,
          }),
          code: `TWR-LIST-${suffix}`,
          source: 'TOWER',
          sourceRefId: `tower-list-${suffix}`,
          claimDate: getArmoryToday(baseNow),
          expiresAt: claim.ticket.expiresAt,
        },
      });
      const expiredTowerTicket = await prisma.armoryTicket.create({
        data: {
          userId: owner.id,
          rewardSnapshot: JSON.stringify({
            source: 'Tower of Rewards', rewardId: 'tower-expired', rewardType: 'GAMING_TIME',
            description: 'Expired Tower reward', value: 10, gamingMinutes: 10,
          }),
          code: `TWR-EXPIRED-${suffix}`,
          source: 'TOWER',
          sourceRefId: `tower-expired-${suffix}`,
          claimDate: getArmoryToday(baseNow),
          expiresAt: baseNow,
        },
      });
      const refreshedClaim = await getTowerCurrent(owner.id, baseNow);
      assert.equal(refreshedClaim.attempt, null);
      assert.deepEqual(
        new Set(refreshedClaim.rewardTickets.map((ticket) => ticket.id)),
        new Set([claim.ticket.id, secondVisibleTicket.id]),
      );
      assert.ok(refreshedClaim.rewardTickets.every((ticket) => {
        assert.deepEqual(Object.keys(ticket).sort(), ['expiresAt', 'id', 'reward']);
        return !JSON.stringify(ticket).includes('"code"');
      }));
      assert.equal(refreshedClaim.rewardTickets.some((ticket) => ticket.id === expiredTowerTicket.id), false);
      assert.equal(await prisma.armoryTicket.count({ where: { source: 'TOWER', sourceRefId: first.attemptId } }), 1);

      const beforeExpiry = new Date(claim.ticket.expiresAt.getTime() - 1);
      assert.equal((await redeemArmoryTicket(claim.ticket.id, beforeExpiry)).status, 'REDEEMED');
      assert.equal((await getTowerCurrent(owner.id, beforeExpiry)).rewardTickets.some((ticket) => ticket.id === claim.ticket.id), false);

      const armoryTicket = await prisma.armoryTicket.create({
        data: {
          userId: owner.id,
          rewardSnapshot: JSON.stringify({ description: 'Armory regression ticket' }),
          code: `ARMORY-${suffix}`,
          source: 'ARMORY',
          claimDate: '2030-08-20',
          expiresAt: getTowerTokenExpiry(baseNow),
        },
      });
      const nextCalendarDay = new Date(baseNow.getTime() + 23 * oneHour);
      await assert.rejects(() => redeemArmoryTicket(armoryTicket.id, nextCalendarDay), /TICKET_EXPIRED/);
      assert.equal((await redeemArmoryTicket(armoryTicket.id, baseNow)).status, 'REDEEMED');

      const currentClaimDate = getArmoryToday();
      const currentExpiry = new Date(Date.now() + oneHour);
      const artifactListTicket = await prisma.armoryTicket.create({
        data: {
          userId: owner.id,
          rewardSnapshot: JSON.stringify({ rewardType: 'GAMING_MINUTES', gamingMinutes: 15, description: 'Artifact list reward' }),
          code: `ARMORY-LIST-${suffix}`,
          source: 'ARMORY',
          sourceRefId: `armory-list-${suffix}`,
          claimDate: currentClaimDate,
          expiresAt: currentExpiry,
        },
      });
      const hiddenTowerTicket = await prisma.armoryTicket.create({
        data: {
          userId: owner.id,
          rewardSnapshot: JSON.stringify({ rewardType: 'GAMING_TIME', gamingMinutes: 15, description: 'Tower-only reward' }),
          code: `TWR-HIDDEN-${suffix}`,
          source: 'TOWER',
          sourceRefId: `tower-hidden-${suffix}`,
          claimDate: currentClaimDate,
          expiresAt: currentExpiry,
        },
      });
      const armoryState = await getArmoryState(owner.id);
      assert.equal(armoryState.tickets.some((ticket) => ticket.id === artifactListTicket.id), true);
      assert.equal(armoryState.tickets.some((ticket) => ticket.id === hiddenTowerTicket.id), false);
    });

    await suite.test('a red card wipes prior safe rewards and permits the next token', async () => {
      const firstCheckIn = await booking(lossUser.id, 'CHECKED_IN', baseNow);
      const secondCheckIn = await booking(lossUser.id, 'CHECKED_IN', new Date(baseNow.getTime() + oneHour));
      await grantTowerToken(firstCheckIn.id, { id: lossUser.id });
      await grantTowerToken(secondCheckIn.id, { id: lossUser.id });
      const attempt = await startTowerAttempt(lossUser.id, baseNow);
      await prisma.towerAttempt.update({ where: { id: attempt.attemptId }, data: { redCards: JSON.stringify(Array(10).fill('A')) } });
      const safe = await pickTowerCard(lossUser.id, attempt.attemptId, attempt.cards[1].id, baseNow);
      const continued = await continueTowerAttempt(lossUser.id, attempt.attemptId, 1, baseNow);
      const continuedRetry = await continueTowerAttempt(lossUser.id, attempt.attemptId, 1, baseNow);
      assert.equal(continued.canClaim, false);
      assert.equal(continued.securedReward, null);
      assert.deepEqual(continuedRetry, continued);
      assert.equal((await getTowerCurrent(lossUser.id, baseNow)).attempt?.canClaim, false);
      assert.equal(continued.cards.length, 3);
      await assert.rejects(
        () => claimTowerReward(lossUser.id, attempt.attemptId, baseNow),
        (error: TowerError) => error.code === 'CLIMB_COMMITTED',
      );
      const loss = await pickTowerCard(lossUser.id, attempt.attemptId, continued.cards[0].id, baseNow);

      assert.equal(loss.result, 'LOSS');
      assert.equal(loss.attempt.securedReward, null);
      assert.equal(loss.attempt.canClaim, false);
      assert.equal((await prisma.towerAttempt.findUniqueOrThrow({ where: { id: attempt.attemptId } })).securedLevel, 0);
      assertTerminalReveal(loss.attempt);
      assert.equal((await getTowerCurrent(lossUser.id, baseNow)).attempt, null);
      const recoveredLoss = await getTowerCurrent(lossUser.id, baseNow, { recoveryAttemptId: attempt.attemptId });
      assert.equal(recoveredLoss.attempt?.status, 'LOST');
      assertTerminalReveal(recoveredLoss.attempt!);
      assert.equal((await getTowerCurrent(owner.id, baseNow, { recoveryAttemptId: attempt.attemptId })).attempt, null);
      await assert.rejects(
        () => claimTowerReward(lossUser.id, attempt.attemptId, baseNow),
        (error: TowerError) => error.code === 'NO_SECURED_REWARD',
      );
      assert.equal(await prisma.armoryTicket.count({ where: { source: 'TOWER', sourceRefId: attempt.attemptId } }), 0);
      assert.notEqual((await startTowerAttempt(lossUser.id, baseNow)).attemptId, attempt.attemptId);
    });

    await suite.test('guarded picks complete floor ten and claimable completion blocks another run', async () => {
      const checkedIn = await booking(completeUser.id);
      await grantTowerToken(checkedIn.id, { id: completeUser.id });
      await grantManualTowerToken(completeUser.id, `request-${suffix}-complete-next`, admin.id, baseNow);
      const attempt = await startTowerAttempt(completeUser.id, baseNow);
      await prisma.towerAttempt.update({ where: { id: attempt.attemptId }, data: { redCards: JSON.stringify(Array(10).fill('A')) } });
      const concurrent = await Promise.all([
        pickTowerCard(completeUser.id, attempt.attemptId, attempt.cards[1].id, baseNow),
        pickTowerCard(completeUser.id, attempt.attemptId, attempt.cards[1].id, baseNow),
      ]);
      assert.deepEqual(concurrent[0], concurrent[1]);
      let result = concurrent[0];
      for (let level = 2; level <= 10; level += 1) {
        const continued = await continueTowerAttempt(completeUser.id, attempt.attemptId, level - 1, baseNow);
        result = await pickTowerCard(completeUser.id, attempt.attemptId, continued.cards[1].id, baseNow);
      }
      assert.equal(result.completed, true);
      assert.equal(result.attempt.status, 'COMPLETED');
      assert.equal((await prisma.towerAttempt.findUniqueOrThrow({ where: { id: attempt.attemptId } })).securedLevel, 10);
      assertTerminalReveal(result.attempt);
      assert.equal((await getTowerCurrent(completeUser.id, baseNow)).attempt?.status, 'COMPLETED');
      await assert.rejects(
        () => startTowerAttempt(completeUser.id, baseNow),
        (error: TowerError) => error.code === 'ACTIVE_ATTEMPT_EXISTS',
      );
      const completeDeadline = new Date(result.attempt.runExpiresAt);
      await claimTowerReward(completeUser.id, attempt.attemptId, new Date(completeDeadline.getTime() - 1));
      assert.notEqual((await startTowerAttempt(completeUser.id, completeDeadline)).attemptId, attempt.attemptId);
    });

    await suite.test('the 120-second boundary forfeits rewards and unlocks the next token', async () => {
      const firstCheckIn = await booking(timeoutUser.id, 'CHECKED_IN', baseNow);
      const secondCheckIn = await booking(timeoutUser.id, 'CHECKED_IN', new Date(baseNow.getTime() + oneHour));
      await grantTowerToken(firstCheckIn.id, { id: timeoutUser.id });
      await grantTowerToken(secondCheckIn.id, { id: timeoutUser.id });
      const attempt = await startTowerAttempt(timeoutUser.id, baseNow);
      assert.equal(attempt.runExpiresAt, new Date(baseNow.getTime() + 120_000).toISOString());
      assert.equal(attempt.serverNow, baseNow.toISOString());
      await prisma.towerAttempt.update({
        where: { id: attempt.attemptId },
        data: { redCards: JSON.stringify(Array(10).fill('A')) },
      });

      const boundary = new Date(attempt.runExpiresAt);
      const beforeBoundary = new Date(boundary.getTime() - 1);
      const safe = await pickTowerCard(timeoutUser.id, attempt.attemptId, attempt.cards[1].id, beforeBoundary);
      assert.equal(safe.result, 'SAFE');
      assert.equal(safe.attempt.canClaim, true);

      await assert.rejects(
        () => pickTowerCard(timeoutUser.id, attempt.attemptId, attempt.cards[1].id, boundary),
        (error: TowerError) => error.code === 'TOWER_RUN_EXPIRED',
      );
      await assert.rejects(
        () => claimTowerReward(timeoutUser.id, attempt.attemptId, boundary),
        (error: TowerError) => error.code === 'TOWER_RUN_EXPIRED',
      );

      const restored = await getTowerCurrent(timeoutUser.id, boundary);
      assert.equal(restored.attempt, null);
      const recovered = await getTowerCurrent(timeoutUser.id, boundary, { recoveryAttemptId: attempt.attemptId });
      assert.equal(recovered.attempt?.status, 'TIMED_OUT');
      assert.equal(recovered.attempt?.securedReward, null);
      assert.equal(recovered.attempt?.canClaim, false);
      assertTerminalReveal(recovered.attempt!);
      assert.equal(await prisma.armoryTicket.count({ where: { source: 'TOWER', sourceRefId: attempt.attemptId } }), 0);
      assert.equal((await getTowerHomePrompt(timeoutUser.id, boundary))?.kind, 'TOKEN');
      assert.notEqual((await startTowerAttempt(timeoutUser.id, boundary)).attemptId, attempt.attemptId);
    });

    await suite.test('the exact expiry boundary excludes tokens and blocks play and claims', async () => {
      const checkedIn = await booking(expiryUser.id);
      const granted = await grantTowerToken(checkedIn.id, { id: expiryUser.id });
      const beforeBoundary = new Date(granted.token.expiresAt.getTime() - 1);
      assert.equal((await getTowerCurrent(expiryUser.id, beforeBoundary)).availableTokens, 1);
      const attempt = await startTowerAttempt(expiryUser.id, beforeBoundary);
      assert.equal(attempt.runExpiresAt, granted.token.expiresAt.toISOString());
      await prisma.towerAttempt.update({ where: { id: attempt.attemptId }, data: { redCards: JSON.stringify(Array(10).fill('A')) } });
      const safe = await pickTowerCard(expiryUser.id, attempt.attemptId, attempt.cards[1].id, beforeBoundary);
      const boundary = new Date(granted.token.expiresAt);

      await assert.rejects(
        () => pickTowerCard(expiryUser.id, attempt.attemptId, attempt.cards[1].id, boundary),
        (error: TowerError) => error.code === 'TOWER_EXPIRED',
      );
      await assert.rejects(
        () => claimTowerReward(expiryUser.id, attempt.attemptId, boundary),
        (error: TowerError) => error.code === 'TOWER_EXPIRED',
      );
      const restored = await getTowerCurrent(expiryUser.id, boundary);
      assert.equal(restored.availableTokens, 0);
      assert.equal(restored.nextTokenExpiresAt, null);
      assert.equal(restored.attempt, null);
      const recovered = await getTowerCurrent(expiryUser.id, boundary, { recoveryAttemptId: attempt.attemptId });
      assert.equal(recovered.attempt?.status, 'EXPIRED');
      assert.equal(recovered.attempt?.securedReward, null);
      assertTerminalReveal(recovered.attempt!);
      assert.equal(await getTowerHomePrompt(expiryUser.id, boundary), null);
    });

    await suite.test('homepage prompt covers available and unfinished attempts only', async () => {
      assert.equal(await getTowerHomePrompt(bannerUser.id, baseNow), null);
      const checkedIn = await booking(bannerUser.id);
      await grantTowerToken(checkedIn.id, { id: bannerUser.id });
      assert.equal((await getTowerHomePrompt(bannerUser.id, baseNow))?.kind, 'TOKEN');
      const attempt = await startTowerAttempt(bannerUser.id, baseNow);
      assert.equal((await getTowerHomePrompt(bannerUser.id, baseNow))?.kind, 'ATTEMPT');
      assert.equal(await getTowerHomePrompt(bannerUser.id, new Date(attempt.runExpiresAt)), null);
    });

    await suite.test('admin token history is source-aware, filterable, and cursor paginated', async () => {
      const firstPage = await getTowerAdminHistory({ take: 2, query: suffix, now: baseNow });
      assert.equal(firstPage.items.length, 2);
      assert.ok(firstPage.nextCursor);
      assert.ok(firstPage.items.every((item) => item.earnedAt instanceof Date));
      const secondPage = await getTowerAdminHistory({ take: 2, query: suffix, cursor: firstPage.nextCursor!, now: baseNow });
      assert.ok(secondPage.items.length > 0);
      assert.ok(firstPage.items.every((item) => ['ADMIN', 'CHECK_IN'].includes(item.source)));
      const timedOut = await getTowerAdminHistory({
        status: 'TIMED_OUT',
        query: `timeout ${suffix}`,
        now: new Date(baseNow.getTime() + 120_000),
      });
      assert.ok(timedOut.items.length > 0);
      assert.ok(timedOut.items.every((item) => item.effectiveStatus === 'TIMED_OUT' && item.attempt?.securedLevel === 0));
      const expired = await getTowerAdminHistory({ status: 'EXPIRED', query: suffix, now: getTowerTokenExpiry(baseNow) });
      assert.ok(expired.items.length > 0);
      assert.ok(expired.items.every((item) => item.effectiveStatus === 'EXPIRED' || item.attempt?.status !== 'IN_PROGRESS'));
    });
  } finally {
    await prisma.station.delete({ where: { id: station.id } });
    await prisma.user.deleteMany({ where: { id: { in: [...users.map((user) => user.id), admin.id] } } });
  }
});
