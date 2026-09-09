import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { caseInsensitiveContains } from '@/lib/prisma-search';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import { displayEmicFromUnits, EMIC_UNIT_FACTOR, getEmicBalanceUnits } from '@/lib/emic';
import {
  F1_2026_COMPETITION,
  F1_2026_DRIVERS,
  F1_2026_RACES,
  F1_2026_SOURCE,
} from '@/data/watch-party/f1-2026';

export const WATCH_PARTY_COIN_UNIT_FACTOR = EMIC_UNIT_FACTOR;
export const DEFAULT_WATCH_PARTY_ENTRY_FEE_RUPEES = 100;
export const DEFAULT_WATCH_PARTY_ENTRY_COINS = 500;
export const DEFAULT_WATCH_PARTY_ENTRY_COIN_UNITS =
  DEFAULT_WATCH_PARTY_ENTRY_COINS * WATCH_PARTY_COIN_UNIT_FACTOR;
export const WATCH_PARTY_SEASON = 2026;
export const WATCH_PARTY_ADMIN_TIME_ZONE = 'Asia/Kolkata';

const PARTY_STATUSES = new Set(['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED']);
const MAX_STAKE_COINS = 100_000;
const MIN_MULTIPLIER_BPS = 10_000;
const MAX_MULTIPLIER_BPS = 100_000;
const ADMIN_PARTY_LIMIT = 24;
const MAX_ADMIN_PAGE_LIMIT = 80;
const ADMIN_FAN_PICK_AUDIT_LIMIT = 25;
const MAX_PREDICTION_OPTIONS = 24;

type Tx = Prisma.TransactionClient;

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

type FanPickAuditInput = PaginationInput & {
  query?: unknown;
  status?: unknown;
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
  return displayEmicFromUnits(units);
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
  if (value == null || value === '') return DEFAULT_WATCH_PARTY_ENTRY_COINS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_STAKE_COINS) {
    throw new WatchPartyError('INVALID_ENTRY_REWARD', 'Check-in EMIC Reward must be a whole number from 1 to 100,000.');
  }
  return parsed;
}

function normalizeEntryFee(value: unknown) {
  if (value == null || value === '') return DEFAULT_WATCH_PARTY_ENTRY_FEE_RUPEES;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000) {
    throw new WatchPartyError('INVALID_ENTRY_FEE', 'Event Entry Fee must be a whole number from 0 to 100,000.');
  }
  return parsed;
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
  if (rawOptions.length > MAX_PREDICTION_OPTIONS) {
    throw new WatchPartyError(
      'INVALID_PREDICTION_OPTIONS',
      `Add no more than ${MAX_PREDICTION_OPTIONS} Fan Pick options.`,
    );
  }
  const options = rawOptions.map((option, index) => {
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
  if (homeTeam.toLocaleLowerCase() === awayTeam.toLocaleLowerCase()) {
    throw new WatchPartyError('INVALID_WATCH_PARTY', 'Choose two different participants.');
  }
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
  return getEmicBalanceUnits(userId);
}

type F12026ImportInput = {
  raceIds?: unknown;
  entryFeeRupees?: unknown;
  entryCoins?: unknown;
  driverMultipliers?: unknown;
};

export function getF12026ImportCatalog() {
  return {
    races: F1_2026_RACES.map((race) => ({ ...race })),
    drivers: F1_2026_DRIVERS.map((driver) => ({ ...driver })),
  };
}

function normalizeF12026Import(input: F12026ImportInput) {
  if (!Array.isArray(input.raceIds) || input.raceIds.length < 1 || input.raceIds.length > F1_2026_RACES.length) {
    throw new WatchPartyError('INVALID_F1_RACES', 'Select between 1 and 10 F1 races.');
  }
  const raceIds = input.raceIds.map((value) => requiredString(value, 'F1 race', 40));
  if (new Set(raceIds).size !== raceIds.length) {
    throw new WatchPartyError('INVALID_F1_RACES', 'Each F1 race can be selected only once.');
  }
  const racesById = new Map(F1_2026_RACES.map((race) => [race.id, race]));
  const races = raceIds.map((id) => racesById.get(id));
  if (races.some((race) => !race)) {
    throw new WatchPartyError('INVALID_F1_RACES', 'One or more selected F1 races are unavailable.');
  }

  if (!input.driverMultipliers || typeof input.driverMultipliers !== 'object' || Array.isArray(input.driverMultipliers)) {
    throw new WatchPartyError('INVALID_F1_DRIVERS', 'Add a reward multiplier for every F1 driver.');
  }
  const multiplierInput = input.driverMultipliers as Record<string, unknown>;
  const expectedKeys = new Set(F1_2026_DRIVERS.map((driver) => driver.key));
  if (Object.keys(multiplierInput).length !== expectedKeys.size || Object.keys(multiplierInput).some((key) => !expectedKeys.has(key))) {
    throw new WatchPartyError('INVALID_F1_DRIVERS', 'Use exactly the current 22 F1 drivers.');
  }
  const options = F1_2026_DRIVERS.map((driver) => ({
    key: driver.key,
    label: `${driver.name} - ${driver.team}`,
    multiplierBasisPoints: normalizeMultiplierBasisPoints(multiplierInput[driver.key]),
  }));

  return {
    races: races as (typeof F1_2026_RACES)[number][],
    entryFeeRupees: normalizeEntryFee(input.entryFeeRupees),
    entryCoins: normalizeEntryCoins(input.entryCoins),
    options,
  };
}

export async function importF12026WatchParties(_adminId: string, input: F12026ImportInput) {
  const normalized = normalizeF12026Import(input);
  const selectedIds = normalized.races.map((race) => `f1-2026-${race.id}`);

  const importOnce = () => runSerializableTransaction(async (tx) => {
    const existing = await tx.watchParty.findMany({
      where: { id: { in: selectedIds } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((party) => party.id));
    const createdIds: string[] = [];

    for (const race of normalized.races) {
      const id = `f1-2026-${race.id}`;
      if (existingIds.has(id)) continue;
      await tx.watchParty.create({
        data: {
          id,
          title: race.name,
          description: `Formula 1 race watch party for the ${race.shortName}.`,
          status: 'ACTIVE',
          source: F1_2026_SOURCE,
          providerMatchId: id,
          providerCompetitionCode: F1_2026_COMPETITION,
          providerSeason: WATCH_PARTY_SEASON,
          providerPayload: JSON.stringify({ race, drivers: F1_2026_DRIVERS }),
          homeTeam: 'Formula 1',
          awayTeam: race.shortName,
          kickoffAt: new Date(race.kickoffAt),
          venue: race.venue,
          entryFeeRupees: normalized.entryFeeRupees,
          entryCoins: normalized.entryCoins,
          entryCoinUnits: normalized.entryCoins * WATCH_PARTY_COIN_UNIT_FACTOR,
          predictionOptions: JSON.stringify(normalized.options),
          predictionLockAt: new Date(race.kickoffAt),
        },
      });
      createdIds.push(id);
    }
    return { createdIds, skippedCount: existing.length };
  });

  let result: Awaited<ReturnType<typeof importOnce>>;
  try {
    result = await importOnce();
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')) throw error;
    result = await importOnce();
  }

  return {
    createdCount: result.createdIds.length,
    skippedCount: result.skippedCount,
    selectedCount: normalized.races.length,
  };
}

export async function getWatchPartyList(userId?: string) {
  const [walletUnits, parties] = await Promise.all([
    userId ? getWatchPartyWallet(userId) : Promise.resolve(null),
    prisma.watchParty.findMany({
      where: {
        status: 'ACTIVE',
        predictionStatus: { notIn: ['SETTLED', 'VOID'] },
      },
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
  ]);

  return {
    walletCoins: walletUnits == null ? null : displayCoinsFromUnits(walletUnits),
    parties: parties.map((party) => serializePartySummary(party, walletUnits)),
  };
}

export async function getWatchPartyDetail(partyId: string, userId?: string) {
  const [walletUnits, party] = await Promise.all([
    userId ? getWatchPartyWallet(userId) : Promise.resolve(null),
    prisma.watchParty.findFirst({
      where: {
        id: partyId,
        status: 'ACTIVE',
        predictionStatus: { notIn: ['SETTLED', 'VOID'] },
      },
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
  const data = {
    ...normalizePartyInput(input),
    source: 'MANUAL',
    providerMatchId: null,
    providerCompetitionCode: null,
    providerSeason: null,
    providerPayload: null,
  };
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
        status: 'CLOSED',
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
      data: { status: 'CLOSED', predictionStatus: 'VOID' },
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
  };
}

export async function getAdminWatchPartyFanPickAudit(
  partyId: string,
  input: FanPickAuditInput = {},
) {
  const skip = normalizePageSkip(input.skip);
  const take = Math.min(
    normalizePageTake(input.take, ADMIN_FAN_PICK_AUDIT_LIMIT),
    ADMIN_FAN_PICK_AUDIT_LIMIT,
  );
  const query = typeof input.query === 'string' ? input.query.trim().slice(0, 100) : '';
  const requestedStatus = typeof input.status === 'string' ? input.status.trim().toUpperCase() : '';
  const status = requestedStatus && requestedStatus !== 'ALL' ? requestedStatus : null;
  if (status && !['ACTIVE', 'WON', 'LOST', 'VOID'].includes(status)) {
    throw new WatchPartyError('INVALID_FAN_PICK_STATUS', 'Choose a valid Fan Pick status.');
  }

  const party = await prisma.watchParty.findUnique({
    where: { id: partyId },
    select: {
      id: true,
      title: true,
      source: true,
      homeTeam: true,
      awayTeam: true,
      kickoffAt: true,
      predictionStatus: true,
    },
  });
  if (!party) {
    throw new WatchPartyError('PARTY_NOT_FOUND', 'Watch party not found.', 404);
  }

  const filteredWhere: Prisma.WatchPartyPredictionWhereInput = {
    partyId,
    ...(status ? { status } : {}),
    ...(query ? {
      OR: [
        { optionLabel: caseInsensitiveContains(query) },
        { user: { is: { name: caseInsensitiveContains(query) } } },
        { user: { is: { email: caseInsensitiveContains(query) } } },
      ],
    } : {}),
  };

  const [totals, statusGroups, predictions] = await Promise.all([
    prisma.watchPartyPrediction.aggregate({
      where: { partyId },
      _count: { _all: true },
      _sum: { stakeUnits: true, payoutUnits: true },
    }),
    prisma.watchPartyPrediction.groupBy({
      by: ['status'],
      where: { partyId },
      _count: { _all: true },
    }),
    prisma.watchPartyPrediction.findMany({
      where: filteredWhere,
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: take + 1,
    }),
  ]);

  const counts = new Map(statusGroups.map((group) => [group.status, group._count._all]));
  const eventName = party.source === F1_2026_SOURCE
    ? party.title
    : `${party.homeTeam} vs ${party.awayTeam}`;

  return {
    event: {
      id: party.id,
      name: eventName,
      kickoffAt: party.kickoffAt.toISOString(),
      predictionStatus: party.predictionStatus,
    },
    summary: {
      totalPicks: totals._count._all,
      emicUsed: displayCoinsFromUnits(totals._sum.stakeUnits ?? 0),
      emicReturned: displayCoinsFromUnits(totals._sum.payoutUnits ?? 0),
      matchedPicks: counts.get('WON') ?? 0,
      unmatchedPicks: counts.get('LOST') ?? 0,
    },
    picks: predictions.slice(0, take).map((prediction) => ({
      id: prediction.id,
      userName: prediction.user.name,
      userEmail: prediction.user.email,
      optionLabel: prediction.optionLabel,
      multiplier: formatMultiplier(prediction.multiplierBasisPoints),
      emicUsed: displayCoinsFromUnits(prediction.stakeUnits),
      emicReturned: prediction.payoutUnits == null
        ? null
        : displayCoinsFromUnits(prediction.payoutUnits),
      status: prediction.status,
      pickedAt: prediction.createdAt.toISOString(),
    })),
    pageInfo: pageInfo(skip, take, predictions.length),
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
