import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { caseInsensitiveContains } from '@/lib/prisma-search';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import premierLeagueFixtures from '@/data/watch-party/premier-league-2026-27-fixtures.json';

export const WATCH_PARTY_COIN_UNIT_FACTOR = 10;
export const DEFAULT_WATCH_PARTY_ENTRY_FEE_RUPEES = 100;
export const DEFAULT_WATCH_PARTY_ENTRY_COINS = 500;
export const DEFAULT_WATCH_PARTY_ENTRY_COIN_UNITS =
  DEFAULT_WATCH_PARTY_ENTRY_COINS * WATCH_PARTY_COIN_UNIT_FACTOR;
export const WATCH_PARTY_COMPETITION_CODE = 'PL';
export const WATCH_PARTY_COMPETITION_NAME = 'Premier League';
export const WATCH_PARTY_SEASON = 2026;
export const WATCH_PARTY_ADMIN_TIME_ZONE = 'Asia/Kolkata';
export const WATCH_PARTY_SHOP_ORDER_PENDING = 'PENDING';
export const WATCH_PARTY_SHOP_ORDER_GIVEN = 'GIVEN';
export const WATCH_PARTY_SHOP_ORDER_CANCELLED = 'CANCELLED';

const PARTY_STATUSES = new Set(['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED']);
const MAX_STAKE_COINS = 100_000;
const MIN_MULTIPLIER_BPS = 10_000;
const MAX_MULTIPLIER_BPS = 100_000;
const ADMIN_PARTY_LIMIT = 24;
const SHOP_ORDER_LIMIT = 24;
const MAX_ADMIN_PAGE_LIMIT = 80;
const WATCH_PARTY_SHOP_ITEMS = {
  BRONZE: { label: 'Bronze Pass', category: 'Gaming', itemType: 'HOUR_PASS', detail: '10 hrs', tokenCost: 13_000, accent: 'bronze' },
  SILVER: { label: 'Silver Pass', category: 'Gaming', itemType: 'HOUR_PASS', detail: '20 hrs', tokenCost: 23_000, accent: 'silver' },
  GOLD: { label: 'Gold Pass', category: 'Gaming', itemType: 'HOUR_PASS', detail: '30 hrs', tokenCost: 30_000, accent: 'gold' },
  BLACK: { label: 'Black Pass', category: 'Racing', itemType: 'HOUR_PASS', detail: '10 hrs', tokenCost: 24_000, accent: 'black' },
  APEX: { label: 'Apex Pass', category: 'Racing', itemType: 'HOUR_PASS', detail: '15 hrs', tokenCost: 31_500, accent: 'apex' },
  GUILD_HERO: { label: 'Guild Hero', category: 'Guild', itemType: 'GUILD_MEMBERSHIP', detail: 'Membership ticket', tokenCost: 4_990, accent: 'guild-hero' },
  GUILD_MASTER: { label: 'Guild Master', category: 'Guild', itemType: 'GUILD_MEMBERSHIP', detail: 'Membership ticket', tokenCost: 9_990, accent: 'guild-master' },
  DRINK_125: { label: 'Premium Drink Coupon', category: 'Drinks', itemType: 'DRINK', detail: 'Counter coupon', tokenCost: 1_250, accent: 'drink' },
  DRINK_60: { label: 'Classic Drink Coupon', category: 'Drinks', itemType: 'DRINK', detail: 'Counter coupon', tokenCost: 600, accent: 'drink' },
  DRINK_40: { label: 'Quick Drink Coupon', category: 'Drinks', itemType: 'DRINK', detail: 'Counter coupon', tokenCost: 400, accent: 'drink' },
  DRINK_20: { label: 'Mini Drink Coupon', category: 'Drinks', itemType: 'DRINK', detail: 'Counter coupon', tokenCost: 200, accent: 'drink' },
} as const;

type Tx = Prisma.TransactionClient;
type WatchPartyShopItemKey = keyof typeof WATCH_PARTY_SHOP_ITEMS;

type PredictionOption = {
  key: string;
  label: string;
  multiplierBasisPoints: number;
};

type WatchPartyInput = {
  title?: unknown;
  description?: unknown;
  status?: unknown;
  source?: unknown;
  providerMatchId?: unknown;
  providerCompetitionCode?: unknown;
  providerSeason?: unknown;
  providerPayload?: unknown;
  homeTeam?: unknown;
  awayTeam?: unknown;
  kickoffAt?: unknown;
  venue?: unknown;
  entryFeeRupees?: unknown;
  entryCoins?: unknown;
  predictionLockAt?: unknown;
  predictionOptions?: unknown;
};

type PaginationInput = {
  skip?: unknown;
  take?: unknown;
};

type LocalPremierLeagueFixture = {
  season: string;
  competition: string;
  matchweek: number;
  fixture_date: string;
  home_team: string;
  away_team: string;
  kickoff_time_uk: string | null;
  schedule_status: string;
  source: string;
  fixture_id: string;
};

export class WatchPartyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'WatchPartyError';
  }
}

export function friendlyWatchPartyError(error: unknown) {
  if (error instanceof WatchPartyError) {
    return { error: error.message, code: error.code, status: error.status };
  }
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'P2002'
  ) {
    return {
      error: 'This watch party action was already completed.',
      code: 'DUPLICATE_ACTION',
      status: 409,
    };
  }
  return {
    error: 'Watch party action failed. Please try again.',
    code: 'WATCH_PARTY_FAILED',
    status: 500,
  };
}

export function displayCoinsFromUnits(units: number) {
  const coins = units / WATCH_PARTY_COIN_UNIT_FACTOR;
  return Number.isInteger(coins) ? coins : Number(coins.toFixed(1));
}

export function coinUnitsFromCoins(coins: unknown) {
  const parsed = Number(coins);
  if (
    !Number.isFinite(parsed)
    || parsed < 1
    || parsed > MAX_STAKE_COINS
    || !Number.isInteger(parsed * WATCH_PARTY_COIN_UNIT_FACTOR)
  ) {
    throw new WatchPartyError(
      'INVALID_COIN_AMOUNT',
      `Enter an amount between 1 and ${MAX_STAKE_COINS.toLocaleString('en-US')} EMIC.`,
    );
  }
  return Math.round(parsed * WATCH_PARTY_COIN_UNIT_FACTOR);
}

export function formatMultiplier(multiplierBasisPoints: number) {
  return `${(multiplierBasisPoints / 10_000).toFixed(2).replace(/\.00$/, '')}x`;
}

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePageSkip(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizePageTake(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_ADMIN_PAGE_LIMIT);
}

function pageInfo(skip: number, take: number, loadedCount: number) {
  const hasMore = loadedCount > take;
  return {
    skip,
    take,
    hasMore,
    nextSkip: hasMore ? skip + take : null,
  };
}

function optionalString(value: unknown, max = 300) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function requiredString(value: unknown, label: string, max = 120) {
  const normalized = optionalString(value, max);
  if (!normalized) {
    throw new WatchPartyError('INVALID_WATCH_PARTY', `${label} is required.`);
  }
  return normalized;
}

function optionalDate(value: unknown) {
  if (!value) return null;
  if (typeof value === 'string') {
    const localDate = localDateTimeInZoneToUtcDate(value, WATCH_PARTY_ADMIN_TIME_ZONE);
    if (localDate) return localDate;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function requiredDate(value: unknown, label: string) {
  const date = optionalDate(value);
  if (!date) {
    throw new WatchPartyError('INVALID_WATCH_PARTY', `${label} is required.`);
  }
  return date;
}

function normalizeStatus(value: unknown, fallback: string, allowed: Set<string>) {
  const status = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return allowed.has(status) ? status : fallback;
}

function normalizeEntryCoins(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_STAKE_COINS) {
    return DEFAULT_WATCH_PARTY_ENTRY_COINS;
  }
  return parsed;
}

function normalizeEntryFee(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000) {
    return DEFAULT_WATCH_PARTY_ENTRY_FEE_RUPEES;
  }
  return parsed;
}

function watchPartyShopItemKeys() {
  return Object.keys(WATCH_PARTY_SHOP_ITEMS) as WatchPartyShopItemKey[];
}

function watchPartyShopItemConfig(itemKey: unknown) {
  const normalized = typeof itemKey === 'string' ? itemKey.trim().toUpperCase() : '';
  if (!Object.prototype.hasOwnProperty.call(WATCH_PARTY_SHOP_ITEMS, normalized)) {
    throw new WatchPartyError('INVALID_SHOP_ITEM', 'Choose a valid EMIC reward.');
  }
  return {
    key: normalized as WatchPartyShopItemKey,
    config: WATCH_PARTY_SHOP_ITEMS[normalized as WatchPartyShopItemKey],
  };
}

function serializeWatchPartyShopItem(key: WatchPartyShopItemKey) {
  const config = WATCH_PARTY_SHOP_ITEMS[key];
  return {
    itemKey: key,
    itemType: config.itemType,
    label: config.label,
    category: config.category,
    detail: config.detail,
    tokenCost: config.tokenCost,
    accent: config.accent,
  };
}

function serializeWatchPartyShopOrder(order: any) {
  return {
    id: order.id,
    itemKey: order.itemKey,
    itemType: order.itemType,
    label: order.itemLabel,
    category: order.itemCategory,
    tokenCost: order.tokenCost,
    status: order.status,
    requestedAt: order.createdAt?.toISOString?.() ?? null,
    givenAt: order.givenAt?.toISOString?.() ?? null,
    cancelledAt: order.cancelledAt?.toISOString?.() ?? null,
    userId: order.userId,
    userName: order.user?.name ?? 'User',
    userEmail: order.user?.email ?? '',
  };
}

function normalizeMultiplierBasisPoints(value: unknown) {
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed)
    || parsed < MIN_MULTIPLIER_BPS
    || parsed > MAX_MULTIPLIER_BPS
  ) {
    throw new WatchPartyError(
      'INVALID_MULTIPLIER',
      'Reward multiplier must be between 1× and 10×.',
    );
  }
  return parsed;
}

function defaultPredictionOptions(homeTeam: string, awayTeam: string): PredictionOption[] {
  return [
    { key: 'HOME', label: homeTeam, multiplierBasisPoints: 20_000 },
    { key: 'DRAW', label: 'Draw / Tie', multiplierBasisPoints: 30_000 },
    { key: 'AWAY', label: awayTeam, multiplierBasisPoints: 20_000 },
  ];
}

function normalizePredictionOptions(input: unknown, homeTeam: string, awayTeam: string) {
  const rawOptions = Array.isArray(input) ? input : defaultPredictionOptions(homeTeam, awayTeam);
  const options = rawOptions.slice(0, 6).map((option, index) => {
    const value = option as Record<string, unknown>;
    const key = optionalString(value.key, 24)?.toUpperCase()
      ?? (index === 0 ? 'HOME' : index === 1 ? 'DRAW' : index === 2 ? 'AWAY' : `CUSTOM_${index + 1}`);
    return {
      key,
      label: requiredString(value.label, 'Fan Pick option', 80),
      multiplierBasisPoints: normalizeMultiplierBasisPoints(
        value.multiplierBasisPoints ?? value.multiplierBps ?? 20_000,
      ),
    };
  });

  if (options.length < 2) {
    throw new WatchPartyError(
      'INVALID_PREDICTION_OPTIONS',
      'Add at least two Fan Pick options.',
    );
  }
  if (new Set(options.map((option) => option.key)).size !== options.length) {
    throw new WatchPartyError(
      'INVALID_PREDICTION_OPTIONS',
      'Fan Pick option keys must be unique.',
    );
  }
  return options;
}

function parsePredictionOptions(party: { predictionOptions?: string | null; homeTeam: string; awayTeam: string }) {
  if (party.predictionOptions) {
    try {
      const parsed = JSON.parse(party.predictionOptions);
      return normalizePredictionOptions(parsed, party.homeTeam, party.awayTeam);
    } catch {
      return defaultPredictionOptions(party.homeTeam, party.awayTeam);
    }
  }
  return defaultPredictionOptions(party.homeTeam, party.awayTeam);
}

function predictionLockAt(party: { kickoffAt: Date; predictionLockAt?: Date | null }) {
  return party.predictionLockAt ?? party.kickoffAt;
}

function isPredictionLocked(party: { kickoffAt: Date; predictionLockAt?: Date | null; predictionStatus: string }, now = new Date()) {
  return party.predictionStatus !== 'OPEN' || now >= predictionLockAt(party);
}

function inviteState(party: any, invite: any, prediction: any) {
  const invited = Boolean(invite);
  const checkedIn = Boolean(invite?.checkedInAt);
  const entered = Boolean(invite?.enteredAt);
  const active = party.status === 'ACTIVE';
  const locked = isPredictionLocked(party);
  return {
    invited,
    checkedIn,
    entered,
    entryPaid: Boolean(invite?.entryPaid),
    canEnter: active && checkedIn,
    canPredict: active && checkedIn && entered && !locked && !prediction,
    invitedAt: invite?.invitedAt?.toISOString?.() ?? null,
    checkedInAt: invite?.checkedInAt?.toISOString?.() ?? null,
    enteredAt: invite?.enteredAt?.toISOString?.() ?? null,
  };
}

function serializePrediction(prediction: any) {
  if (!prediction) return null;
  return {
    id: prediction.id,
    marketLabel: prediction.marketLabel,
    optionKey: prediction.optionKey,
    optionLabel: prediction.optionLabel,
    multiplier: formatMultiplier(prediction.multiplierBasisPoints),
    stakeCoins: displayCoinsFromUnits(prediction.stakeUnits),
    payoutCoins: prediction.payoutUnits == null
      ? null
      : displayCoinsFromUnits(prediction.payoutUnits),
    status: prediction.status,
  };
}

function serializePartySummary(party: any, walletUnits: number | null) {
  const invite = party.invites?.[0] ?? null;
  const prediction = party.predictions?.[0] ?? null;
  const options = parsePredictionOptions(party);
  return {
    id: party.id,
    createdAt: party.createdAt.toISOString(),
    updatedAt: party.updatedAt.toISOString(),
    title: party.title,
    description: party.description,
    status: party.status,
    source: party.source,
    homeTeam: party.homeTeam,
    awayTeam: party.awayTeam,
    kickoffAt: party.kickoffAt.toISOString(),
    venue: party.venue,
    entryFeeRupees: party.entryFeeRupees,
    entryCoins: party.entryCoins,
    predictionStatus: party.predictionStatus,
    predictionLockAt: predictionLockAt(party).toISOString(),
    settledOption: party.settledOption,
    invite: inviteState(party, invite, prediction),
    prediction: serializePrediction(prediction),
    options: options.map((option) => ({
      ...option,
      multiplier: formatMultiplier(option.multiplierBasisPoints),
    })),
    inviteCount: party._count?.invites ?? 0,
    predictionCount: party._count?.predictions ?? 0,
    walletCoins: walletUnits == null ? null : displayCoinsFromUnits(walletUnits),
  };
}

function serializePartyDetail(party: any, walletUnits: number | null) {
  const summary = serializePartySummary(party, walletUnits);
  const leaderboard = (party.allPredictions ?? [])
    .filter((prediction: any) => prediction.status === 'WON')
    .sort((a: any, b: any) => (b.payoutUnits ?? 0) - (a.payoutUnits ?? 0))
    .slice(0, 10)
    .map((prediction: any) => ({
      id: prediction.id,
      userName: prediction.user?.name ?? 'Player',
      payoutCoins: displayCoinsFromUnits(prediction.payoutUnits ?? 0),
    }));

  return {
    ...summary,
    leaderboard,
  };
}

function normalizePartyInput(input: WatchPartyInput) {
  const homeTeam = requiredString(input.homeTeam, 'Team A');
  const awayTeam = requiredString(input.awayTeam, 'Team B');
  const kickoffAt = requiredDate(input.kickoffAt, 'Event start');
  const title = optionalString(input.title, 140) ?? `${homeTeam} vs ${awayTeam}`;
  const entryCoins = normalizeEntryCoins(input.entryCoins);
  const options = normalizePredictionOptions(input.predictionOptions, homeTeam, awayTeam);
  return {
    title,
    description: optionalString(input.description, 600),
    status: normalizeStatus(input.status, 'ACTIVE', PARTY_STATUSES),
    source: optionalString(input.source, 40)?.toUpperCase() ?? 'MANUAL',
    providerMatchId: optionalString(input.providerMatchId, 80),
    providerCompetitionCode: optionalString(input.providerCompetitionCode, 20),
    providerSeason: input.providerSeason == null ? null : parsePositiveInteger(input.providerSeason, WATCH_PARTY_SEASON),
    providerPayload: typeof input.providerPayload === 'string'
      ? input.providerPayload
      : input.providerPayload
        ? JSON.stringify(input.providerPayload)
        : null,
    homeTeam,
    awayTeam,
    kickoffAt,
    venue: optionalString(input.venue, 180),
    entryFeeRupees: normalizeEntryFee(input.entryFeeRupees),
    entryCoins,
    entryCoinUnits: entryCoins * WATCH_PARTY_COIN_UNIT_FACTOR,
    predictionOptions: JSON.stringify(options),
    predictionLockAt: optionalDate(input.predictionLockAt),
  };
}

export async function getWatchPartyWallet(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { watchPartyCoins: true },
  });
  return user?.watchPartyCoins ?? 0;
}

export async function getWatchPartyShop(userId: string, tx?: Tx) {
  const client = tx ?? prisma;
  const [user, orders] = await Promise.all([
    client.user.findUnique({
      where: { id: userId },
      select: { watchPartyCoins: true },
    }),
    client.watchPartyShopOrder.findMany({
      where: {
        userId,
        status: { in: [WATCH_PARTY_SHOP_ORDER_PENDING, WATCH_PARTY_SHOP_ORDER_GIVEN] },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    walletCoins: displayCoinsFromUnits(user?.watchPartyCoins ?? 0),
    items: watchPartyShopItemKeys().map(serializeWatchPartyShopItem),
    orders: orders.map(serializeWatchPartyShopOrder),
  };
}

export async function purchaseWatchPartyShopOrder(userId: string, itemKey: unknown) {
  const { key, config } = watchPartyShopItemConfig(itemKey);
  const costUnits = config.tokenCost * WATCH_PARTY_COIN_UNIT_FACTOR;

  return runSerializableTransaction(async (tx) => {
    const debited = await tx.user.updateMany({
      where: { id: userId, role: 'USER', watchPartyCoins: { gte: costUnits } },
      data: { watchPartyCoins: { decrement: costUnits } },
    });
    if (debited.count !== 1) {
      throw new WatchPartyError(
        'INSUFFICIENT_TOKENS',
        'Your EMIC balance is too low to redeem this item.',
        409,
      );
    }

    const [user, order] = await Promise.all([
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { watchPartyCoins: true },
      }),
      tx.watchPartyShopOrder.create({
        data: {
          userId,
          itemKey: key,
          itemType: config.itemType,
          itemLabel: config.label,
          itemCategory: config.category,
          tokenCost: config.tokenCost,
          tokenCostUnits: costUnits,
          status: WATCH_PARTY_SHOP_ORDER_PENDING,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    await tx.watchPartyCoinLedger.create({
      data: {
        userId,
        amountUnits: -costUnits,
        balanceAfterUnits: user.watchPartyCoins,
        reason: 'SHOP_ORDER_PURCHASE',
        note: `${order.id}:${config.label}`,
      },
    });

    return getWatchPartyShop(userId, tx);
  });
}

export async function getAdminWatchPartyShopOrders(input: PaginationInput = {}) {
  const skip = normalizePageSkip(input.skip);
  const take = normalizePageTake(input.take, SHOP_ORDER_LIMIT);
  const orders = await prisma.watchPartyShopOrder.findMany({
    where: { status: WATCH_PARTY_SHOP_ORDER_PENDING },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    skip,
    take: take + 1,
  });
  const visibleOrders = orders.slice(0, take);

  return {
    orders: visibleOrders.map(serializeWatchPartyShopOrder),
    pageInfo: pageInfo(skip, take, orders.length),
  };
}

export async function markWatchPartyShopOrderGiven(adminId: string, orderId: string) {
  return runSerializableTransaction(async (tx) => {
    const order = await tx.watchPartyShopOrder.findUnique({
      where: { id: orderId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!order) {
      throw new WatchPartyError('SHOP_ORDER_NOT_FOUND', 'EMIC redemption not found.', 404);
    }
    if (order.status !== WATCH_PARTY_SHOP_ORDER_PENDING) {
      throw new WatchPartyError('SHOP_ORDER_NOT_PENDING', 'This EMIC redemption is no longer pending.', 409);
    }

    const given = await tx.watchPartyShopOrder.update({
      where: { id: orderId },
      data: {
        status: WATCH_PARTY_SHOP_ORDER_GIVEN,
        givenAt: new Date(),
        givenById: adminId,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return serializeWatchPartyShopOrder(given);
  });
}

export async function cancelWatchPartyShopOrder(adminId: string, orderId: string) {
  return runSerializableTransaction(async (tx) => {
    const order = await tx.watchPartyShopOrder.findUnique({
      where: { id: orderId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!order) {
      throw new WatchPartyError('SHOP_ORDER_NOT_FOUND', 'EMIC redemption not found.', 404);
    }
    if (order.status !== WATCH_PARTY_SHOP_ORDER_PENDING) {
      throw new WatchPartyError('SHOP_ORDER_NOT_PENDING', 'This EMIC redemption is no longer pending.', 409);
    }

    const refundUnits = order.tokenCostUnits;
    const [user, cancelled] = await Promise.all([
      tx.user.update({
        where: { id: order.userId },
        data: { watchPartyCoins: { increment: refundUnits } },
        select: { watchPartyCoins: true },
      }),
      tx.watchPartyShopOrder.update({
        where: { id: orderId },
        data: {
          status: WATCH_PARTY_SHOP_ORDER_CANCELLED,
          cancelledAt: new Date(),
          cancelledById: adminId,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    await tx.watchPartyCoinLedger.create({
      data: {
        userId: order.userId,
        actorId: adminId,
        amountUnits: refundUnits,
        balanceAfterUnits: user.watchPartyCoins,
        reason: 'SHOP_ORDER_REFUND',
        note: `${order.id}:${order.itemLabel}`,
      },
    });

    return serializeWatchPartyShopOrder(cancelled);
  });
}

export async function getWatchPartyList(userId?: string) {
  const [walletUnits, parties, shop] = await Promise.all([
    userId ? getWatchPartyWallet(userId) : Promise.resolve(null),
    prisma.watchParty.findMany({
      where: { status: 'ACTIVE' },
      include: {
        invites: {
          where: { userId: userId ?? '__anonymous__' },
          select: {
            id: true,
            invitedAt: true,
            checkedInAt: true,
            entryPaid: true,
            enteredAt: true,
          },
        },
        predictions: {
          where: { userId: userId ?? '__anonymous__' },
        },
        _count: { select: { invites: true, predictions: true } },
      },
      orderBy: [{ kickoffAt: 'asc' }, { createdAt: 'desc' }],
      take: 40,
    }),
    userId ? getWatchPartyShop(userId) : Promise.resolve({
      walletCoins: null,
      items: watchPartyShopItemKeys().map(serializeWatchPartyShopItem),
      orders: [],
    }),
  ]);

  return {
    walletCoins: walletUnits == null ? null : displayCoinsFromUnits(walletUnits),
    parties: parties.map((party) => serializePartySummary(party, walletUnits)),
    shop,
  };
}

export async function getWatchPartyDetail(partyId: string, userId?: string) {
  const [walletUnits, party] = await Promise.all([
    userId ? getWatchPartyWallet(userId) : Promise.resolve(null),
    prisma.watchParty.findFirst({
      where: { id: partyId, status: { not: 'ARCHIVED' } },
      include: {
        invites: {
          where: { userId: userId ?? '__anonymous__' },
          select: {
            id: true,
            invitedAt: true,
            checkedInAt: true,
            entryPaid: true,
            enteredAt: true,
          },
        },
        predictions: {
          where: { userId: userId ?? '__anonymous__' },
        },
        _count: { select: { invites: true, predictions: true } },
      },
    }),
  ]);

  if (!party) {
    throw new WatchPartyError('PARTY_NOT_FOUND', 'Watch party not found.', 404);
  }

  const allPredictions = await prisma.watchPartyPrediction.findMany({
    where: { partyId, status: 'WON' },
    include: { user: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  });

  return serializePartyDetail({ ...party, allPredictions }, walletUnits);
}

export async function createWatchParty(adminId: string, input: WatchPartyInput) {
  const data = normalizePartyInput(input);
  const party = await prisma.watchParty.create({ data });
  return getAdminWatchParty(adminId, party.id);
}

export async function updateWatchParty(partyId: string, input: WatchPartyInput) {
  const existing = await prisma.watchParty.findUnique({ where: { id: partyId } });
  if (!existing) {
    throw new WatchPartyError('PARTY_NOT_FOUND', 'Watch party not found.', 404);
  }

  const data = normalizePartyInput({
    ...existing,
    ...input,
    title: input.title ?? existing.title,
    homeTeam: input.homeTeam ?? existing.homeTeam,
    awayTeam: input.awayTeam ?? existing.awayTeam,
    kickoffAt: input.kickoffAt ?? existing.kickoffAt,
    entryCoins: input.entryCoins ?? existing.entryCoins,
    entryFeeRupees: input.entryFeeRupees ?? existing.entryFeeRupees,
    predictionOptions: input.predictionOptions ?? parsePredictionOptions(existing),
  });
  const providerBacked = existing.source !== 'MANUAL'
    || Boolean(existing.providerMatchId)
    || Boolean(existing.providerCompetitionCode)
    || existing.providerSeason != null
    || Boolean(existing.providerPayload);
  const importedTeamsEdited = providerBacked
    && (data.homeTeam !== existing.homeTeam || data.awayTeam !== existing.awayTeam);

  await prisma.watchParty.update({
    where: { id: partyId },
    data: {
      ...data,
      source: importedTeamsEdited ? 'MANUAL' : data.source || existing.source,
      providerMatchId: importedTeamsEdited
        ? null
        : data.providerMatchId ?? existing.providerMatchId,
      providerCompetitionCode: importedTeamsEdited
        ? null
        : data.providerCompetitionCode ?? existing.providerCompetitionCode,
      providerSeason: importedTeamsEdited
        ? null
        : data.providerSeason ?? existing.providerSeason,
      providerPayload: importedTeamsEdited
        ? null
        : data.providerPayload ?? existing.providerPayload,
    },
  });
  return getAdminWatchParty(null, partyId);
}

export async function archiveWatchParty(partyId: string) {
  await prisma.watchParty.update({
    where: { id: partyId },
    data: { status: 'ARCHIVED' },
  });
  return { success: true };
}

export async function archiveCompletedWatchParties(input: { titleContains?: string } = {}) {
  const result = await prisma.watchParty.updateMany({
    where: {
      status: { not: 'ARCHIVED' },
      predictionStatus: { in: ['SETTLED', 'VOID'] },
      ...(input.titleContains ? { title: caseInsensitiveContains(input.titleContains) } : {}),
    },
    data: { status: 'ARCHIVED' },
  });

  return { success: true, archivedCount: result.count };
}

export async function stopWatchPartyPredictions(adminId: string, partyId: string) {
  return runSerializableTransaction(async (tx) => {
    const party = await tx.watchParty.findUnique({ where: { id: partyId } });
    if (!party || party.status === 'ARCHIVED') {
      throw new WatchPartyError('PARTY_NOT_FOUND', 'Watch party not found.', 404);
    }
    if (party.predictionStatus === 'SETTLED') {
      throw new WatchPartyError('PARTY_SETTLED', 'The result for this watch party is already final.', 409);
    }
    if (party.predictionStatus === 'VOID') {
      throw new WatchPartyError(
        'PARTY_VOID',
        'Fan Picks for this watch party were cancelled and EMIC was restored.',
        409,
      );
    }
    if (party.predictionStatus !== 'OPEN') return getAdminWatchParty(adminId, partyId, tx);

    await tx.watchParty.update({
      where: { id: partyId },
      data: {
        predictionStatus: 'CLOSED',
        predictionLockAt: new Date(),
      },
    });
    return getAdminWatchParty(adminId, partyId, tx);
  });
}

export async function inviteWatchPartyUsers(adminId: string, partyId: string, userIds: unknown) {
  const ids = Array.isArray(userIds)
    ? [
      ...new Set(
        userIds
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim()),
      ),
    ]
    : [];
  if (!ids.length) {
    throw new WatchPartyError('USERS_REQUIRED', 'Select at least one user to invite.');
  }

  return runSerializableTransaction(async (tx) => {
    const party = await tx.watchParty.findUnique({ where: { id: partyId } });
    if (!party || party.status === 'ARCHIVED') {
      throw new WatchPartyError('PARTY_NOT_FOUND', 'Watch party not found.', 404);
    }

    const users = await tx.user.findMany({
      where: { id: { in: ids }, role: 'USER' },
      select: { id: true },
    });
    const validIds = users.map((user) => user.id);
    if (!validIds.length) {
      throw new WatchPartyError('USERS_REQUIRED', 'No valid users were selected.');
    }

    await Promise.all(validIds.map((userId) => (
      tx.watchPartyInvite.upsert({
        where: { partyId_userId: { partyId, userId } },
        update: { invitedById: adminId },
        create: { partyId, userId, invitedById: adminId },
      })
    )));

    return getAdminWatchParty(adminId, partyId, tx);
  });
}

export async function cancelWatchPartyInvite(adminId: string, partyId: string, userId: unknown) {
  const normalizedUserId = requiredString(userId, 'User', 120);

  return runSerializableTransaction(async (tx) => {
    const invite = await tx.watchPartyInvite.findUnique({
      where: { partyId_userId: { partyId, userId: normalizedUserId } },
      include: { party: true },
    });
    if (!invite || invite.party.status === 'ARCHIVED') {
      throw new WatchPartyError('INVITE_NOT_FOUND', 'Invite not found.', 404);
    }
    if (invite.checkedInAt || invite.entryCreditedAt || invite.enteredAt) {
      throw new WatchPartyError(
        'INVITE_ALREADY_USED',
        'Checked-in invites cannot be cancelled.',
        409,
      );
    }

    const prediction = await tx.watchPartyPrediction.findUnique({
      where: { partyId_userId: { partyId, userId: normalizedUserId } },
      select: { id: true },
    });
    if (prediction) {
      throw new WatchPartyError(
        'INVITE_ALREADY_USED',
        'Invites with a Fan Pick cannot be cancelled.',
        409,
      );
    }

    await tx.watchPartyInvite.delete({ where: { id: invite.id } });
    return getAdminWatchParty(adminId, partyId, tx);
  });
}

export async function checkInWatchPartyInvite(adminId: string, partyId: string, userId: string) {
  return runSerializableTransaction(async (tx) => {
    const invite = await tx.watchPartyInvite.findUnique({
      where: { partyId_userId: { partyId, userId } },
      include: { party: true },
    });
    if (!invite || invite.party.status === 'ARCHIVED') {
      throw new WatchPartyError(
        'INVITE_REQUIRED',
        'This user is not invited to this watch party.',
        404,
      );
    }

    const now = new Date();
    const credited = await tx.watchPartyInvite.updateMany({
      where: { id: invite.id, entryCreditedAt: null },
      data: {
        checkedInAt: invite.checkedInAt ?? now,
        checkedInById: adminId,
        entryPaid: true,
        entryCreditedAt: now,
      },
    });

    if (credited.count === 1) {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { watchPartyCoins: { increment: invite.party.entryCoinUnits } },
        select: { watchPartyCoins: true },
      });
      await tx.watchPartyCoinLedger.create({
        data: {
          userId,
          actorId: adminId,
          amountUnits: invite.party.entryCoinUnits,
          balanceAfterUnits: updatedUser.watchPartyCoins,
          reason: 'ENTRY_CREDIT',
          partyId,
          note: `Counter entry for ${invite.party.title}`,
        },
      });
    } else if (!invite.checkedInAt) {
      await tx.watchPartyInvite.update({
        where: { id: invite.id },
        data: {
          checkedInAt: now,
          checkedInById: adminId,
          entryPaid: true,
        },
      });
    }

    return getAdminWatchParty(adminId, partyId, tx);
  });
}

export async function enterWatchParty(userId: string, partyId: string) {
  await runSerializableTransaction(async (tx) => {
    const invite = await tx.watchPartyInvite.findUnique({
      where: { partyId_userId: { partyId, userId } },
      include: { party: true },
    });
    if (!invite || invite.party.status !== 'ACTIVE') {
      throw new WatchPartyError(
        'INVITE_REQUIRED',
        'You need an invite for this watch party.',
        403,
      );
    }
    if (!invite.checkedInAt) {
      throw new WatchPartyError(
        'CHECKIN_REQUIRED',
        'Check in at the counter to unlock this watch party.',
        403,
      );
    }
    if (!invite.entryCreditedAt) {
      throw new WatchPartyError(
        'ENTRY_NOT_CONFIRMED',
        'Entry is not confirmed yet. Ask the admin to check you in.',
        409,
      );
    }
    if (!invite.enteredAt) {
      await tx.watchPartyInvite.update({
        where: { id: invite.id },
        data: { enteredAt: new Date() },
      });
    }
  });

  return getWatchPartyDetail(partyId, userId);
}

export async function submitWatchPartyPrediction(
  userId: string,
  partyId: string,
  optionKey: string,
  stakeCoins: unknown,
) {
  const stakeUnits = coinUnitsFromCoins(stakeCoins);

  await runSerializableTransaction(async (tx) => {
    const [invite, party] = await Promise.all([
      tx.watchPartyInvite.findUnique({
        where: { partyId_userId: { partyId, userId } },
      }),
      tx.watchParty.findUnique({ where: { id: partyId } }),
    ]);

    if (!invite?.checkedInAt || !invite.enteredAt) {
      throw new WatchPartyError(
        'ENTRY_REQUIRED',
        'Enter this watch party before making a Fan Pick.',
        403,
      );
    }
    if (!party || party.status !== 'ACTIVE') {
      throw new WatchPartyError('PARTY_NOT_FOUND', 'Watch party not found.', 404);
    }
    if (isPredictionLocked(party)) {
      throw new WatchPartyError(
        'PREDICTION_LOCKED',
        'Fan Picks are closed for this event.',
        409,
      );
    }
    const option = parsePredictionOptions(party).find((candidate) => candidate.key === optionKey);
    if (!option) {
      throw new WatchPartyError('OPTION_NOT_FOUND', 'Fan Pick option not found.', 404);
    }
    const existing = await tx.watchPartyPrediction.findUnique({
      where: { partyId_userId: { partyId, userId } },
      select: { id: true },
    });
    if (existing) {
      throw new WatchPartyError(
        'ALREADY_PREDICTED',
        'You already confirmed a Fan Pick for this event.',
        409,
      );
    }

    const debited = await tx.user.updateMany({
      where: { id: userId, watchPartyCoins: { gte: stakeUnits } },
      data: { watchPartyCoins: { decrement: stakeUnits } },
    });
    if (debited.count !== 1) {
      throw new WatchPartyError(
        'INSUFFICIENT_TOKENS',
        'Your EMIC balance is lower than the selected amount.',
        409,
      );
    }
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { watchPartyCoins: true },
    });
    const prediction = await tx.watchPartyPrediction.create({
      data: {
        partyId,
        userId,
        optionKey: option.key,
        optionLabel: option.label,
        multiplierBasisPoints: option.multiplierBasisPoints,
        stakeUnits,
      },
    });
    await tx.watchPartyCoinLedger.create({
      data: {
        userId,
        amountUnits: -stakeUnits,
        balanceAfterUnits: user.watchPartyCoins,
        reason: 'PREDICTION_STAKE',
        partyId,
        predictionId: prediction.id,
        note: `${option.label} (${formatMultiplier(option.multiplierBasisPoints)})`,
      },
    });
  });

  return getWatchPartyDetail(partyId, userId);
}

export async function settleWatchParty(adminId: string, partyId: string, optionKey: string) {
  return runSerializableTransaction(async (tx) => {
    const party = await tx.watchParty.findUnique({
      where: { id: partyId },
      include: { predictions: { where: { status: 'ACTIVE' } } },
    });
    if (!party) {
      throw new WatchPartyError('PARTY_NOT_FOUND', 'Watch party not found.', 404);
    }
    if (party.predictionStatus === 'SETTLED') {
      throw new WatchPartyError('PARTY_SETTLED', 'The result for this watch party is already final.', 409);
    }
    if (party.predictionStatus === 'VOID') {
      throw new WatchPartyError(
        'PARTY_VOID',
        'Fan Picks for this watch party were cancelled and EMIC was restored.',
        409,
      );
    }
    const winningOption = parsePredictionOptions(party).find((option) => option.key === optionKey);
    if (!winningOption) {
      throw new WatchPartyError('OPTION_NOT_FOUND', 'Result option not found.', 404);
    }

    await tx.watchParty.update({
      where: { id: partyId },
      data: {
        predictionStatus: 'SETTLED',
        settledOption: winningOption.key,
        settledAt: new Date(),
        settledById: adminId,
      },
    });

    for (const prediction of party.predictions) {
      if (prediction.optionKey !== winningOption.key) {
        await tx.watchPartyPrediction.update({
          where: { id: prediction.id },
          data: { status: 'LOST', payoutUnits: 0 },
        });
        continue;
      }

      const payoutUnits = Math.floor(
        prediction.stakeUnits * prediction.multiplierBasisPoints / 10_000,
      );
      const user = await tx.user.update({
        where: { id: prediction.userId },
        data: { watchPartyCoins: { increment: payoutUnits } },
        select: { watchPartyCoins: true },
      });
      await tx.watchPartyPrediction.update({
        where: { id: prediction.id },
        data: { status: 'WON', payoutUnits },
      });
      await tx.watchPartyCoinLedger.create({
        data: {
          userId: prediction.userId,
          actorId: adminId,
          amountUnits: payoutUnits,
          balanceAfterUnits: user.watchPartyCoins,
          reason: 'PREDICTION_PAYOUT',
          partyId,
          predictionId: prediction.id,
          note: `${prediction.optionLabel} settled`,
        },
      });
    }

    return getAdminWatchParty(adminId, partyId, tx);
  });
}

export async function voidWatchParty(adminId: string, partyId: string) {
  return runSerializableTransaction(async (tx) => {
    const party = await tx.watchParty.findUnique({
      where: { id: partyId },
      include: { predictions: { where: { status: 'ACTIVE' } } },
    });
    if (!party) {
      throw new WatchPartyError('PARTY_NOT_FOUND', 'Watch party not found.', 404);
    }
    if (party.predictionStatus === 'SETTLED') {
      throw new WatchPartyError('PARTY_SETTLED', 'Completed Fan Picks cannot be cancelled.', 409);
    }
    if (party.predictionStatus === 'VOID') return getAdminWatchParty(adminId, partyId, tx);

    await tx.watchParty.update({
      where: { id: partyId },
      data: { predictionStatus: 'VOID' },
    });

    for (const prediction of party.predictions) {
      const user = await tx.user.update({
        where: { id: prediction.userId },
        data: { watchPartyCoins: { increment: prediction.stakeUnits } },
        select: { watchPartyCoins: true },
      });
      await tx.watchPartyPrediction.update({
        where: { id: prediction.id },
        data: { status: 'VOID', payoutUnits: prediction.stakeUnits },
      });
      await tx.watchPartyCoinLedger.create({
        data: {
          userId: prediction.userId,
          actorId: adminId,
          amountUnits: prediction.stakeUnits,
          balanceAfterUnits: user.watchPartyCoins,
          reason: 'PREDICTION_REFUND',
          partyId,
          predictionId: prediction.id,
          note: party.title,
        },
      });
    }

    return getAdminWatchParty(adminId, partyId, tx);
  });
}

export async function getAdminWatchPartyState(input: PaginationInput = {}) {
  const skip = normalizePageSkip(input.skip);
  const take = normalizePageTake(input.take, ADMIN_PARTY_LIMIT);
  const parties = await prisma.watchParty.findMany({
    where: { status: { not: 'ARCHIVED' } },
    include: {
      invites: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { invitedAt: 'desc' },
      },
      predictions: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { invites: true, predictions: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { kickoffAt: 'desc' }],
    skip,
    take: take + 1,
  });
  const visibleParties = parties.slice(0, take);

  return {
    parties: visibleParties.map(serializeAdminParty),
    pageInfo: pageInfo(skip, take, parties.length),
  };
}

async function getAdminWatchParty(_adminId: string | null, partyId: string, tx?: Tx) {
  const client = tx ?? prisma;
  const party = await client.watchParty.findUnique({
    where: { id: partyId },
    include: {
      invites: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { invitedAt: 'desc' },
      },
      predictions: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { invites: true, predictions: true } },
    },
  });
  if (!party) {
    throw new WatchPartyError('PARTY_NOT_FOUND', 'Watch party not found.', 404);
  }
  return serializeAdminParty(party);
}

function serializeAdminParty(party: any) {
  return {
    id: party.id,
    createdAt: party.createdAt.toISOString(),
    updatedAt: party.updatedAt.toISOString(),
    title: party.title,
    description: party.description,
    status: party.status,
    source: party.source,
    providerMatchId: party.providerMatchId,
    providerCompetitionCode: party.providerCompetitionCode,
    providerSeason: party.providerSeason,
    homeTeam: party.homeTeam,
    awayTeam: party.awayTeam,
    kickoffAt: party.kickoffAt.toISOString(),
    venue: party.venue,
    entryFeeRupees: party.entryFeeRupees,
    entryCoins: party.entryCoins,
    predictionStatus: party.predictionStatus,
    predictionLockAt: predictionLockAt(party).toISOString(),
    settledOption: party.settledOption,
    options: parsePredictionOptions(party).map((option) => ({
      ...option,
      multiplier: formatMultiplier(option.multiplierBasisPoints),
    })),
    inviteCount: party._count?.invites ?? party.invites?.length ?? 0,
    predictionCount: party._count?.predictions ?? party.predictions?.length ?? 0,
    invites: (party.invites ?? []).map((invite: any) => ({
      id: invite.id,
      userId: invite.userId,
      userName: invite.user?.name ?? 'User',
      userEmail: invite.user?.email ?? '',
      invitedAt: invite.invitedAt.toISOString(),
      checkedInAt: invite.checkedInAt?.toISOString?.() ?? null,
      enteredAt: invite.enteredAt?.toISOString?.() ?? null,
      entryPaid: invite.entryPaid,
      credited: Boolean(invite.entryCreditedAt),
    })),
    predictions: (party.predictions ?? []).map((prediction: any) => ({
      id: prediction.id,
      userId: prediction.userId,
      userName: prediction.user?.name ?? 'User',
      userEmail: prediction.user?.email ?? '',
      optionKey: prediction.optionKey,
      optionLabel: prediction.optionLabel,
      stakeCoins: displayCoinsFromUnits(prediction.stakeUnits),
      payoutCoins: prediction.payoutUnits == null
        ? null
        : displayCoinsFromUnits(prediction.payoutUnits),
      status: prediction.status,
    })),
  };
}

function parseLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

function parseLocalTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, hour, minute] = match;
  const parsed = {
    hour: Number(hour),
    minute: Number(minute),
  };
  if (parsed.hour > 23 || parsed.minute > 59) return null;
  return parsed;
}

function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function localDateTimeInZoneToUtcDate(value: string, timeZone: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const [, dateValue, timeValue] = match;
  const date = parseLocalDate(dateValue);
  const time = parseLocalTime(timeValue);
  if (!date || !time) return null;

  const desiredLocal = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute);
  let guess = new Date(desiredLocal);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zoned = getZonedDateParts(guess, timeZone);
    const actualLocal = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
    );
    const diff = actualLocal - desiredLocal;
    if (diff === 0) break;
    guess = new Date(guess.getTime() - diff);
  }

  return guess;
}

export function ukFixtureKickoffToUtcIso(dateValue: string, timeValue: string | null) {
  if (!timeValue) return null;
  return localDateTimeInZoneToUtcDate(`${dateValue}T${timeValue}`, 'Europe/London')?.toISOString() ?? null;
}

function normalizeFixtureDateFilter(value?: string | null) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeMatchday(value?: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function fetchPremierLeagueFixtureMatches(input: {
  dateFrom?: string | null;
  dateTo?: string | null;
  matchday?: string | null;
  team?: string | null;
  hasTime?: string | null;
  teamsOnly?: string | null;
} = {}) {
  const dateFrom = normalizeFixtureDateFilter(input.dateFrom);
  const dateTo = normalizeFixtureDateFilter(input.dateTo);
  const matchday = normalizeMatchday(input.matchday);
  const team = optionalString(input.team, 80)?.toLowerCase() ?? null;
  const hasTime = input.hasTime === 'true';
  const teamsOnly = input.teamsOnly === 'true';
  const fixtures = premierLeagueFixtures as LocalPremierLeagueFixture[];
  const teams = Array.from(new Set(
    fixtures.flatMap((fixture) => [fixture.home_team, fixture.away_team]),
  )).sort((a, b) => a.localeCompare(b));
  const matches = fixtures.filter((fixture) => {
    if (dateFrom && fixture.fixture_date < dateFrom) return false;
    if (dateTo && fixture.fixture_date > dateTo) return false;
    if (matchday && fixture.matchweek !== matchday) return false;
    if (
      team
      && !fixture.home_team.toLowerCase().includes(team)
      && !fixture.away_team.toLowerCase().includes(team)
    ) {
      return false;
    }
    if (hasTime && !fixture.kickoff_time_uk) return false;
    return true;
  });

  return {
    competitionCode: WATCH_PARTY_COMPETITION_CODE,
    competitionName: WATCH_PARTY_COMPETITION_NAME,
    season: WATCH_PARTY_SEASON,
    teams,
    matches: teamsOnly ? [] : matches.map((fixture) => ({
      providerMatchId: fixture.fixture_id,
      homeTeam: fixture.home_team,
      awayTeam: fixture.away_team,
      kickoffAt: ukFixtureKickoffToUtcIso(fixture.fixture_date, fixture.kickoff_time_uk),
      fixtureDate: fixture.fixture_date,
      kickoffTimeUk: fixture.kickoff_time_uk,
      status: fixture.schedule_status,
      matchday: fixture.matchweek,
      stage: null,
      venue: null,
      title: `${fixture.home_team} vs ${fixture.away_team}`,
      source: 'LOCAL_FIXTURE_JSON',
      providerCompetitionCode: WATCH_PARTY_COMPETITION_CODE,
      providerSeason: WATCH_PARTY_SEASON,
      providerPayload: JSON.stringify(fixture),
    })),
  };
}
