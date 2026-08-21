import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import { getArmoryToday } from '@/lib/armory';
import {
  getTowerRunExpiry,
  getTowerTokenExpiry,
  isTowerDeadlineReached,
} from '@/lib/tower-clock';

export { getTowerTokenExpiry } from '@/lib/tower-clock';

export const TOWER_TOTAL_LEVELS = 10;
export const TOWER_CARD_SLOTS = ['A', 'B', 'C'] as const;
export const TOWER_PASS_TYPES = ['BRONZE', 'SILVER', 'GOLD'] as const;

const TOWER_REWARDS_KEY = 'tower_rewards';
const TOWER_ENABLED_KEY = 'tower_enabled';
const TOWER_DEFAULTS_VERSION_KEY = 'tower_defaults_version';
const TOWER_DEFAULTS_VERSION = 'tower_rewards_v1';
export type TowerRewardType = 'DISCOUNT' | 'GAMING_TIME' | 'RACING_TIME' | 'PASS';
export type TowerRewardConfig = {
  id: string;
  level: number;
  name: string;
  type: TowerRewardType;
  value?: number;
  passType?: string;
};
export type TowerPublicReward = Omit<TowerRewardConfig, 'level'>;
export type TowerCard = { id: string };

type TowerPickRecord = {
  level: number;
  cardId: string;
  cardSlot: string;
  result: 'SAFE' | 'LOSS';
  reward?: TowerPublicReward;
  securedReward?: TowerPublicReward | null;
  continued?: boolean;
};

type TowerStore = typeof prisma | Prisma.TransactionClient;
type AttemptWithToken = Prisma.TowerAttemptGetPayload<{ include: { token: true } }>;
type TowerRewardTicketRecord = Prisma.ArmoryTicketGetPayload<{
  select: { id: true; rewardSnapshot: true; expiresAt: true };
}>;

export type TowerPublicRewardTicket = {
  id: string;
  reward: TowerPublicReward;
  expiresAt: string;
};

export const DEFAULT_TOWER_REWARDS: TowerRewardConfig[] = [
  { id: 'tower_l1_10m_gaming', level: 1, name: '10 Minutes Gaming', type: 'GAMING_TIME', value: 10 },
  { id: 'tower_l2_15m_gaming', level: 2, name: '15 Minutes Gaming', type: 'GAMING_TIME', value: 15 },
  { id: 'tower_l3_20m_racing', level: 3, name: '20 Minutes Racing', type: 'RACING_TIME', value: 20 },
  { id: 'tower_l4_30m_gaming', level: 4, name: '30 Minutes Gaming', type: 'GAMING_TIME', value: 30 },
  { id: 'tower_l5_10_discount', level: 5, name: '10% Booking Discount', type: 'DISCOUNT', value: 10 },
  { id: 'tower_l6_45m_gaming', level: 6, name: '45 Minutes Gaming', type: 'GAMING_TIME', value: 45 },
  { id: 'tower_l7_30m_racing', level: 7, name: '30 Minutes Racing', type: 'RACING_TIME', value: 30 },
  { id: 'tower_l8_60m_gaming', level: 8, name: '60 Minutes Gaming', type: 'GAMING_TIME', value: 60 },
  { id: 'tower_l9_20_discount', level: 9, name: '20% Booking Discount', type: 'DISCOUNT', value: 20 },
  { id: 'tower_l10_bronze_pass', level: 10, name: 'Bronze Pass', type: 'PASS', value: 600, passType: 'BRONZE' },
];

let towerConfigReady = false;

export class TowerError extends Error {
  constructor(readonly code: string, message = code, readonly status = 400) {
    super(message);
  }
}

export function friendlyTowerError(error: unknown) {
  const code = error instanceof TowerError ? error.code : error instanceof Error ? error.message : String(error);
  const map: Record<string, { error: string; status: number }> = {
    TOWER_DISABLED: { error: 'Tower of Rewards is closed right now.', status: 403 },
    TOWER_EXPIRED: { error: 'This Tower Token has expired.', status: 410 },
    TOWER_RUN_EXPIRED: { error: 'Time is up for this climb. Start fresh with your next Tower Token.', status: 410 },
    UNAUTHORIZED: { error: 'Please login to use Tower of Rewards.', status: 401 },
    FORBIDDEN: { error: 'This Tower entry does not belong to you.', status: 403 },
    CHECKIN_NOT_FOUND: { error: 'Check-in not found.', status: 404 },
    INVALID_CHECKIN: { error: 'This booking is not checked in yet.', status: 400 },
    NO_LINKED_USER: { error: 'This check-in has no linked user account.', status: 400 },
    USER_NOT_FOUND: { error: 'User account not found.', status: 404 },
    INVALID_GRANT_REQUEST: { error: 'The manual token request is invalid.', status: 400 },
    NO_TOWER_TOKEN: { error: 'No valid Tower Token is available.', status: 404 },
    TOKEN_USED: { error: 'This Tower Token has already been used.', status: 409 },
    ACTIVE_ATTEMPT_EXISTS: { error: 'You already have an active Tower attempt.', status: 409 },
    INVALID_ATTEMPT: { error: 'Tower attempt not found.', status: 404 },
    ATTEMPT_ENDED: { error: 'This Tower attempt has already ended.', status: 409 },
    INVALID_CARD: { error: 'Choose a valid card.', status: 400 },
    NO_SECURED_REWARD: { error: 'Clear a floor before taking a reward.', status: 400 },
    CLIMB_COMMITTED: { error: 'You chose the next floor. Pick a card before taking a reward.', status: 409 },
    TICKET_CODE_FAILED: { error: 'The reward ticket could not be created. Please retry.', status: 500 },
    BAD_TOWER_CONFIG: { error: 'Tower rewards need admin configuration.', status: 500 },
    INVALID_TOWER_CONFIG: { error: 'Enter a valid reward for every Tower floor.', status: 400 },
  };
  return map[code] ?? { error: 'Tower action failed.', status: 500 };
}

export function isTowerTokenExpired(expiresAt: Date | string, now: Date = new Date()) {
  return isTowerDeadlineReached(expiresAt, now);
}

export async function ensureTowerDefaults(store: TowerStore = prisma) {
  if (towerConfigReady) return;
  const version = await store.setting.findUnique({ where: { key: TOWER_DEFAULTS_VERSION_KEY } });
  if (version?.value === TOWER_DEFAULTS_VERSION) {
    towerConfigReady = true;
    return;
  }
  await store.setting.upsert({
    where: { key: TOWER_ENABLED_KEY },
    update: {},
    create: { key: TOWER_ENABLED_KEY, value: 'true', label: 'Enable Tower of Rewards' },
  });
  await store.setting.upsert({
    where: { key: TOWER_REWARDS_KEY },
    update: { value: JSON.stringify(DEFAULT_TOWER_REWARDS) },
    create: { key: TOWER_REWARDS_KEY, value: JSON.stringify(DEFAULT_TOWER_REWARDS), label: 'Tower Rewards' },
  });
  await store.setting.upsert({
    where: { key: TOWER_DEFAULTS_VERSION_KEY },
    update: { value: TOWER_DEFAULTS_VERSION },
    create: { key: TOWER_DEFAULTS_VERSION_KEY, value: TOWER_DEFAULTS_VERSION, label: 'Tower defaults version' },
  });
  towerConfigReady = true;
}

export async function getTowerConfig(store: TowerStore = prisma) {
  await ensureTowerDefaults(store);
  const settings = await store.setting.findMany({ where: { key: { in: [TOWER_ENABLED_KEY, TOWER_REWARDS_KEY] } } });
  const map = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
  return { enabled: map[TOWER_ENABLED_KEY] !== 'false', rewards: normalizeTowerRewards(map[TOWER_REWARDS_KEY]) };
}

export function normalizeTowerRewards(raw: unknown): TowerRewardConfig[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { throw new TowerError('BAD_TOWER_CONFIG', undefined, 500); }
  }
  if (parsed == null) return DEFAULT_TOWER_REWARDS.map((reward) => ({ ...reward }));
  if (!Array.isArray(parsed) || parsed.length !== TOWER_TOTAL_LEVELS) throw new TowerError('INVALID_TOWER_CONFIG');
  const normalized = parsed.map((reward) => {
    const row = reward as Partial<TowerRewardConfig>;
    const level = Number(row.level);
    const type = row.type;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const value = row.value == null ? undefined : Number(row.value);
    const passType = typeof row.passType === 'string' ? row.passType.trim().toUpperCase() : undefined;
    if (
      !Number.isInteger(level) || level < 1 || level > TOWER_TOTAL_LEVELS || !name
      || !['DISCOUNT', 'GAMING_TIME', 'RACING_TIME', 'PASS'].includes(String(type))
      || !Number.isFinite(value) || Number(value) <= 0
      || (type === 'DISCOUNT' && Number(value) > 100)
      || (type === 'PASS' && !TOWER_PASS_TYPES.includes(passType as typeof TOWER_PASS_TYPES[number]))
    ) throw new TowerError('INVALID_TOWER_CONFIG');
    return {
      id: typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `tower_l${level}`,
      level, name, type: type as TowerRewardType,
      ...(value !== undefined ? { value } : {}),
      ...(passType ? { passType } : {}),
    };
  }).sort((a, b) => a.level - b.level);
  if (!normalized.every((reward, index) => reward.level === index + 1)) throw new TowerError('INVALID_TOWER_CONFIG');
  return normalized;
}

export async function updateTowerAdminConfig(body: unknown) {
  const input = body as { enabled?: unknown; rewards?: unknown } | null;
  const enabled = input?.enabled !== false;
  const rewards = normalizeTowerRewards(input?.rewards);
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: TOWER_ENABLED_KEY },
      update: { value: enabled ? 'true' : 'false', label: 'Enable Tower of Rewards' },
      create: { key: TOWER_ENABLED_KEY, value: enabled ? 'true' : 'false', label: 'Enable Tower of Rewards' },
    });
    await tx.setting.upsert({
      where: { key: TOWER_REWARDS_KEY },
      update: { value: JSON.stringify(rewards), label: 'Tower Rewards' },
      create: { key: TOWER_REWARDS_KEY, value: JSON.stringify(rewards), label: 'Tower Rewards' },
    });
  });
  towerConfigReady = false;
  return getTowerConfig();
}

function publicReward(reward: TowerRewardConfig): TowerPublicReward {
  return {
    id: reward.id, name: reward.name, type: reward.type,
    ...(reward.value !== undefined ? { value: reward.value } : {}),
    ...(reward.passType ? { passType: reward.passType } : {}),
  };
}

export function serializeTowerRewardTicket(ticket: TowerRewardTicketRecord): TowerPublicRewardTicket {
  const snapshot = parseJson<Record<string, unknown>>(ticket.rewardSnapshot, {});
  const rawType = String(snapshot.rewardType ?? 'GAMING_TIME');
  const type = ['DISCOUNT', 'GAMING_TIME', 'RACING_TIME', 'PASS'].includes(rawType)
    ? rawType as TowerRewardType
    : 'GAMING_TIME';
  const fallbackValue = type === 'DISCOUNT'
    ? snapshot.discountPercentage
    : type === 'RACING_TIME'
      ? snapshot.racingMinutes
      : snapshot.gamingMinutes;
  const rawValue = Number(snapshot.value ?? fallbackValue);
  const value = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : undefined;
  const passType = typeof snapshot.passType === 'string' && snapshot.passType.trim()
    ? snapshot.passType.trim()
    : undefined;

  return {
    id: ticket.id,
    reward: {
      id: typeof snapshot.rewardId === 'string' && snapshot.rewardId.trim()
        ? snapshot.rewardId.trim()
        : `tower_reward_${ticket.id}`,
      name: typeof snapshot.description === 'string' && snapshot.description.trim()
        ? snapshot.description.trim()
        : 'Tower Reward',
      type,
      ...(value !== undefined ? { value } : {}),
      ...(passType ? { passType } : {}),
    },
    expiresAt: ticket.expiresAt.toISOString(),
  };
}

function rewardForLevel(rewards: TowerRewardConfig[], level: number) {
  const reward = rewards.find((item) => item.level === level);
  if (!reward) throw new TowerError('BAD_TOWER_CONFIG', undefined, 500);
  return publicReward(reward);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function generateRedCards() {
  return Array.from({ length: TOWER_TOTAL_LEVELS }, () => TOWER_CARD_SLOTS[crypto.randomInt(0, TOWER_CARD_SLOTS.length)]);
}

function towerSecret() {
  return process.env.TOWER_CARD_SECRET || process.env.AUTH_SECRET || 'tower-dev-secret';
}

function cardId(attemptId: string, level: number, slot: string) {
  const digest = crypto.createHmac('sha256', towerSecret()).update(`${attemptId}:${level}:${slot}`).digest('base64url').slice(0, 14);
  return `card_${digest}`;
}

function cardsForLevel(attemptId: string, level: number): TowerCard[] {
  return TOWER_CARD_SLOTS.map((slot) => ({ id: cardId(attemptId, level, slot) }));
}

function slotForCard(attemptId: string, level: number, selectedCardId: string) {
  return TOWER_CARD_SLOTS.find((slot) => cardId(attemptId, level, slot) === selectedCardId) ?? null;
}

function makeTicketCode() {
  return `TWR-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function publicFloors(rewards: TowerRewardConfig[]) {
  return rewards.map((reward) => ({ level: reward.level, reward: publicReward(reward) }));
}

function publicHistory(attempt: AttemptWithToken) {
  return parseJson<TowerPickRecord[]>(attempt.resolvedPicks, []).map((record) => ({
    level: record.level,
    selectedPosition: Math.max(0, TOWER_CARD_SLOTS.indexOf(record.cardSlot as typeof TOWER_CARD_SLOTS[number])),
    result: record.result,
  }));
}

function publicReveal(attempt: AttemptWithToken) {
  const redCards = parseJson<string[]>(attempt.redCards, []);
  if (redCards.length !== TOWER_TOTAL_LEVELS) return [];
  return redCards.map((slot, index) => ({
    level: index + 1,
    redPosition: Math.max(0, TOWER_CARD_SLOTS.indexOf(slot as typeof TOWER_CARD_SLOTS[number])),
  }));
}

function effectiveAttemptStatus(attempt: AttemptWithToken, now: Date) {
  if (!['IN_PROGRESS', 'COMPLETED'].includes(attempt.status)) return attempt.status;
  if (isTowerTokenExpired(attempt.token.expiresAt, now)) return 'EXPIRED';
  if (isTowerDeadlineReached(attempt.runExpiresAt, now)) return 'TIMED_OUT';
  return attempt.status;
}

function serializeAttempt(
  attempt: AttemptWithToken,
  rewards: TowerRewardConfig[],
  now: Date = new Date(),
) {
  const status = effectiveAttemptStatus(attempt, now);
  const forfeited = status === 'TIMED_OUT' || status === 'EXPIRED';
  const securedReward = forfeited
    ? null
    : parseJson<TowerPublicReward | null>(attempt.securedRewardSnapshot, null);
  const latestPick = parseJson<TowerPickRecord[]>(attempt.resolvedPicks, []).at(-1);
  const terminal = status !== 'IN_PROGRESS';
  return {
    attemptId: attempt.id,
    level: attempt.currentLevel,
    totalLevels: TOWER_TOTAL_LEVELS,
    status,
    securedReward,
    canClaim: Boolean(securedReward)
      && latestPick?.result === 'SAFE'
      && latestPick.continued !== true
      && (status === 'IN_PROGRESS' || status === 'COMPLETED'),
    expiresAt: attempt.token.expiresAt.toISOString(),
    runExpiresAt: attempt.runExpiresAt.toISOString(),
    serverNow: now.toISOString(),
    floors: publicFloors(rewards),
    history: publicHistory(attempt),
    cards: status === 'IN_PROGRESS' ? cardsForLevel(attempt.id, attempt.currentLevel) : [],
    ...(terminal ? { reveal: publicReveal(attempt) } : {}),
  };
}

function pickResponse(attempt: AttemptWithToken, rewards: TowerRewardConfig[], record: TowerPickRecord, now: Date) {
  return {
    result: record.result,
    ...(record.reward ? { reward: record.reward } : {}),
    completed: record.result === 'SAFE' && record.level === TOWER_TOTAL_LEVELS,
    attempt: serializeAttempt(attempt, rewards, now),
  };
}

export async function grantTowerToken(checkInId: string, actor: { id: string; role?: string | null }) {
  if (!checkInId) throw new TowerError('CHECKIN_NOT_FOUND', undefined, 404);
  try {
    return await runSerializableTransaction(async (tx) => {
      await ensureTowerDefaults(tx);
      const booking = await tx.booking.findUnique({
        where: { id: checkInId },
        select: { id: true, userId: true, status: true, checkedInAt: true, updatedAt: true },
      });
      if (!booking) throw new TowerError('CHECKIN_NOT_FOUND', undefined, 404);
      if (!booking.userId) throw new TowerError('NO_LINKED_USER');
      if (actor.role !== 'ADMIN' && booking.userId !== actor.id) throw new TowerError('FORBIDDEN', undefined, 403);
      const existing = await tx.towerToken.findUnique({ where: { checkInId } });
      if (existing) return { token: existing, created: false };
      if (booking.status !== 'CHECKED_IN') throw new TowerError('INVALID_CHECKIN');
      const earnedAt = booking.checkedInAt ?? booking.updatedAt;
      const token = await tx.towerToken.create({
        data: {
          userId: booking.userId, checkInId, source: 'CHECK_IN', sourceRefId: `CHECK_IN:${checkInId}`,
          grantedById: actor.role === 'ADMIN' ? actor.id : null,
          earnedAt,
          expiresAt: getTowerTokenExpiry(earnedAt),
        },
      });
      return { token, created: true };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const token = await prisma.towerToken.findUnique({ where: { checkInId } });
    if (!token) throw error;
    return { token, created: false };
  }
}

export async function grantManualTowerToken(userId: string, requestId: string, adminId: string, now: Date = new Date()) {
  const cleanRequestId = requestId.trim();
  if (!userId || !/^[a-zA-Z0-9-]{8,100}$/.test(cleanRequestId)) throw new TowerError('INVALID_GRANT_REQUEST');
  const sourceRefId = `ADMIN:${cleanRequestId}`;
  try {
    return await runSerializableTransaction(async (tx) => {
      const grantor = await tx.user.findFirst({ where: { id: adminId, role: 'ADMIN' }, select: { id: true } });
      if (!grantor) throw new TowerError('FORBIDDEN', undefined, 403);
      const existing = await tx.towerToken.findUnique({ where: { sourceRefId } });
      if (existing) {
        if (existing.userId !== userId) throw new TowerError('INVALID_GRANT_REQUEST');
        return { token: existing, created: false };
      }
      const user = await tx.user.findFirst({ where: { id: userId, role: 'USER' }, select: { id: true } });
      if (!user) throw new TowerError('USER_NOT_FOUND', undefined, 404);
      const token = await tx.towerToken.create({
        data: {
          userId, source: 'ADMIN', sourceRefId, grantedById: adminId,
          earnedAt: now, expiresAt: getTowerTokenExpiry(now),
        },
      });
      return { token, created: true };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const token = await prisma.towerToken.findUnique({ where: { sourceRefId } });
    if (!token) throw error;
    if (token.userId !== userId) throw new TowerError('INVALID_GRANT_REQUEST');
    return { token, created: false };
  }
}

export async function searchTowerUsers(query: string) {
  const clean = query.trim().slice(0, 80);
  if (clean.length < 2) return [];
  return prisma.user.findMany({
    where: { role: 'USER', OR: [{ name: { contains: clean } }, { email: { contains: clean } }] },
    select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 10,
  });
}

export async function getTowerAdminHistory(input: { cursor?: string; take?: number; status?: string; query?: string; now?: Date } = {}) {
  const now = input.now ?? new Date();
  const requestedTake = Number(input.take ?? 25);
  const take = Number.isFinite(requestedTake) ? Math.min(50, Math.max(1, Math.floor(requestedTake))) : 25;
  const query = input.query?.trim().slice(0, 80) ?? '';
  const status = input.status?.toUpperCase() ?? 'ALL';
  const where: Prisma.TowerTokenWhereInput = {
    ...(query ? { user: { OR: [{ name: { contains: query } }, { email: { contains: query } }] } } : {}),
  };
  if (status === 'AVAILABLE') Object.assign(where, { status: 'AVAILABLE', expiresAt: { gt: now } });
  if (status === 'ACTIVE') Object.assign(where, {
    status: 'USED',
    expiresAt: { gt: now },
    attempt: { is: { status: { in: ['IN_PROGRESS', 'COMPLETED'] }, runExpiresAt: { gt: now } } },
  });
  if (status === 'EXPIRED') Object.assign(where, {
    expiresAt: { lte: now },
    OR: [
      { status: 'AVAILABLE' },
      { attempt: { is: { status: { in: ['IN_PROGRESS', 'COMPLETED'] } } } },
    ],
  });
  if (status === 'TIMED_OUT') Object.assign(where, {
    status: 'USED',
    expiresAt: { gt: now },
    attempt: { is: { status: { in: ['IN_PROGRESS', 'COMPLETED'] }, runExpiresAt: { lte: now } } },
  });
  if (status === 'COMPLETED') Object.assign(where, {
    expiresAt: { gt: now },
    attempt: { is: { status: 'COMPLETED', runExpiresAt: { gt: now } } },
  });
  if (['LOST', 'CLAIMED'].includes(status)) Object.assign(where, { attempt: { is: { status } } });
  const rows = await prisma.towerToken.findMany({
    where,
    select: {
      id: true, source: true, status: true, earnedAt: true, expiresAt: true,
      user: { select: { id: true, name: true, email: true } },
      grantedBy: { select: { name: true } },
      attempt: { select: { status: true, securedLevel: true, runExpiresAt: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: take + 1,
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return {
    items: page.map((row) => {
      let effectiveStatus = row.attempt?.status ?? (isTowerTokenExpired(row.expiresAt, now) ? 'EXPIRED' : row.status);
      if (row.attempt && ['IN_PROGRESS', 'COMPLETED'].includes(row.attempt.status)) {
        if (isTowerTokenExpired(row.expiresAt, now)) effectiveStatus = 'EXPIRED';
        else if (isTowerDeadlineReached(row.attempt.runExpiresAt, now)) effectiveStatus = 'TIMED_OUT';
      }
      return {
        id: row.id,
        source: row.source,
        earnedAt: row.earnedAt,
        expiresAt: row.expiresAt,
        user: row.user,
        grantedBy: row.grantedBy,
        effectiveStatus,
        attempt: row.attempt ? {
          status: row.attempt.status,
          securedLevel: ['TIMED_OUT', 'EXPIRED'].includes(effectiveStatus) ? 0 : row.attempt.securedLevel,
        } : null,
      };
    }),
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  };
}

export async function getTowerHomePrompt(userId: string, now: Date = new Date()) {
  const token = await prisma.towerToken.findFirst({
    where: {
      userId, expiresAt: { gt: now },
      OR: [
        { status: 'AVAILABLE' },
        {
          status: 'USED',
          attempt: { is: { status: { in: ['IN_PROGRESS', 'COMPLETED'] }, runExpiresAt: { gt: now } } },
        },
      ],
    },
    select: { status: true, expiresAt: true, attempt: { select: { status: true, runExpiresAt: true } } },
    orderBy: [{ expiresAt: 'asc' }, { earnedAt: 'asc' }],
  });
  if (!token) return null;
  return {
    kind: token.attempt ? 'ATTEMPT' as const : 'TOKEN' as const,
    expiresAt: (token.attempt?.runExpiresAt ?? token.expiresAt).toISOString(),
  };
}

type TowerCurrentOptions = {
  recoveryAttemptId?: string | null;
};

export async function getTowerCurrent(
  userId: string,
  now: Date = new Date(),
  options: TowerCurrentOptions = {},
) {
  const config = await getTowerConfig();
  const recoveryAttemptId = options.recoveryAttemptId?.trim();
  const attemptWhere: Prisma.TowerAttemptWhereInput = recoveryAttemptId
    ? { id: recoveryAttemptId, userId }
    : {
      userId,
      status: { in: ['IN_PROGRESS', 'COMPLETED'] },
      runExpiresAt: { gt: now },
      token: { expiresAt: { gt: now } },
    };
  const [attempt, availableTokens, nextToken, rewardTickets] = await Promise.all([
    prisma.towerAttempt.findFirst({ where: attemptWhere, include: { token: true }, orderBy: { startedAt: 'desc' } }),
    prisma.towerToken.count({ where: { userId, status: 'AVAILABLE', expiresAt: { gt: now } } }),
    prisma.towerToken.findFirst({
      where: { userId, status: 'AVAILABLE', expiresAt: { gt: now } },
      select: { expiresAt: true },
      orderBy: [{ expiresAt: 'asc' }, { earnedAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.armoryTicket.findMany({
      where: { userId, source: 'TOWER', status: 'UNUSED', expiresAt: { gt: now } },
      select: { id: true, rewardSnapshot: true, expiresAt: true },
      orderBy: [{ claimedAt: 'desc' }, { id: 'desc' }],
      take: 10,
    }),
  ]);
  return {
    enabled: config.enabled,
    availableTokens,
    nextTokenExpiresAt: nextToken?.expiresAt.toISOString() ?? null,
    rewardTickets: rewardTickets.map(serializeTowerRewardTicket),
    attempt: attempt ? serializeAttempt(attempt, config.rewards, now) : null,
  };
}

export async function startTowerAttempt(userId: string, now: Date = new Date()) {
  return runSerializableTransaction(async (tx) => {
    const config = await getTowerConfig(tx);
    if (!config.enabled) throw new TowerError('TOWER_DISABLED', undefined, 403);
    const active = await tx.towerAttempt.findFirst({
      where: {
        userId,
        status: 'IN_PROGRESS',
        runExpiresAt: { gt: now },
        token: { expiresAt: { gt: now } },
      },
      include: { token: true }, orderBy: { startedAt: 'desc' },
    });
    if (active) return serializeAttempt(active, config.rewards, now);
    const completed = await tx.towerAttempt.findFirst({
      where: {
        userId,
        status: 'COMPLETED',
        runExpiresAt: { gt: now },
        token: { expiresAt: { gt: now } },
      },
      select: { id: true },
    });
    if (completed) throw new TowerError('ACTIVE_ATTEMPT_EXISTS', undefined, 409);
    const token = await tx.towerToken.findFirst({
      where: { userId, status: 'AVAILABLE', expiresAt: { gt: now } },
      orderBy: [{ expiresAt: 'asc' }, { earnedAt: 'asc' }, { id: 'asc' }],
    });
    if (!token) throw new TowerError('NO_TOWER_TOKEN', undefined, 404);
    const consumed = await tx.towerToken.updateMany({
      where: { id: token.id, status: 'AVAILABLE', expiresAt: { gt: now } }, data: { status: 'USED', usedAt: now },
    });
    if (consumed.count !== 1) throw new TowerError('TOKEN_USED', undefined, 409);
    const attempt = await tx.towerAttempt.create({
      data: {
        tokenId: token.id,
        userId,
        redCards: JSON.stringify(generateRedCards()),
        startedAt: now,
        runExpiresAt: getTowerRunExpiry(now, token.expiresAt),
      },
      include: { token: true },
    });
    return serializeAttempt(attempt, config.rewards, now);
  });
}

export async function pickTowerCard(userId: string, attemptId: string, selectedCardId: string, now: Date = new Date()) {
  if (!attemptId || !selectedCardId) throw new TowerError('INVALID_CARD');
  return runSerializableTransaction(async (tx) => {
    const config = await getTowerConfig(tx);
    if (!config.enabled) throw new TowerError('TOWER_DISABLED', undefined, 403);
    const attempt = await tx.towerAttempt.findUnique({ where: { id: attemptId }, include: { token: true } });
    if (!attempt) throw new TowerError('INVALID_ATTEMPT', undefined, 404);
    if (attempt.userId !== userId) throw new TowerError('FORBIDDEN', undefined, 403);
    if (isTowerTokenExpired(attempt.token.expiresAt, now)) throw new TowerError('TOWER_EXPIRED', undefined, 410);
    if (isTowerDeadlineReached(attempt.runExpiresAt, now)) throw new TowerError('TOWER_RUN_EXPIRED', undefined, 410);
    const history = parseJson<TowerPickRecord[]>(attempt.resolvedPicks, []);
    const duplicate = history.find((record) => record.cardId === selectedCardId);
    if (duplicate) return pickResponse(attempt, config.rewards, duplicate, now);
    if (attempt.status !== 'IN_PROGRESS') throw new TowerError('ATTEMPT_ENDED', undefined, 409);
    const level = attempt.currentLevel;
    const slot = slotForCard(attempt.id, level, selectedCardId);
    if (!slot) throw new TowerError('INVALID_CARD');
    const redCards = parseJson<string[]>(attempt.redCards, []);
    const redSlot = redCards[level - 1];
    if (!TOWER_CARD_SLOTS.includes(redSlot as typeof TOWER_CARD_SLOTS[number])) throw new TowerError('BAD_TOWER_CONFIG', undefined, 500);

    if (slot === redSlot) {
      const record: TowerPickRecord = { level, cardId: selectedCardId, cardSlot: slot, result: 'LOSS', securedReward: null };
      const updated = await tx.towerAttempt.updateMany({
        where: { id: attempt.id, status: 'IN_PROGRESS', currentLevel: level },
        data: {
          status: 'LOST', securedLevel: 0, securedRewardSnapshot: null, completedAt: now,
          resolvedPicks: JSON.stringify([...history, record]),
        },
      });
      if (updated.count !== 1) throw new TowerError('ATTEMPT_ENDED', undefined, 409);
      const ended = await tx.towerAttempt.findUniqueOrThrow({ where: { id: attempt.id }, include: { token: true } });
      return pickResponse(ended, config.rewards, record, now);
    }

    const reward = rewardForLevel(config.rewards, level);
    const status = level === TOWER_TOTAL_LEVELS ? 'COMPLETED' : 'IN_PROGRESS';
    const record: TowerPickRecord = { level, cardId: selectedCardId, cardSlot: slot, result: 'SAFE', reward, securedReward: reward };
    const updated = await tx.towerAttempt.updateMany({
      where: { id: attempt.id, status: 'IN_PROGRESS', currentLevel: level },
      data: {
        currentLevel: level === TOWER_TOTAL_LEVELS ? level : level + 1,
        securedLevel: level, securedRewardSnapshot: JSON.stringify(reward), status,
        completedAt: status === 'COMPLETED' ? now : null, resolvedPicks: JSON.stringify([...history, record]),
      },
    });
    if (updated.count !== 1) throw new TowerError('ATTEMPT_ENDED', undefined, 409);
    const advanced = await tx.towerAttempt.findUniqueOrThrow({ where: { id: attempt.id }, include: { token: true } });
    return pickResponse(advanced, config.rewards, record, now);
  });
}

export async function continueTowerAttempt(userId: string, attemptId: string, level: number, now: Date = new Date()) {
  if (!attemptId || !Number.isInteger(level) || level < 1 || level >= TOWER_TOTAL_LEVELS) {
    throw new TowerError('INVALID_ATTEMPT', undefined, 400);
  }
  return runSerializableTransaction(async (tx) => {
    const config = await getTowerConfig(tx);
    if (!config.enabled) throw new TowerError('TOWER_DISABLED', undefined, 403);
    const attempt = await tx.towerAttempt.findUnique({ where: { id: attemptId }, include: { token: true } });
    if (!attempt) throw new TowerError('INVALID_ATTEMPT', undefined, 404);
    if (attempt.userId !== userId) throw new TowerError('FORBIDDEN', undefined, 403);
    if (isTowerTokenExpired(attempt.token.expiresAt, now)) throw new TowerError('TOWER_EXPIRED', undefined, 410);
    if (isTowerDeadlineReached(attempt.runExpiresAt, now)) throw new TowerError('TOWER_RUN_EXPIRED', undefined, 410);
    if (attempt.status !== 'IN_PROGRESS' || attempt.currentLevel !== level + 1) {
      throw new TowerError('ATTEMPT_ENDED', undefined, 409);
    }

    const history = parseJson<TowerPickRecord[]>(attempt.resolvedPicks, []);
    const latestPick = history.at(-1);
    if (!latestPick || latestPick.level !== level || latestPick.result !== 'SAFE') {
      throw new TowerError('INVALID_ATTEMPT', undefined, 409);
    }
    if (latestPick.continued === true) return serializeAttempt(attempt, config.rewards, now);

    const continuedHistory = [
      ...history.slice(0, -1),
      { ...latestPick, continued: true },
    ];
    const updated = await tx.towerAttempt.updateMany({
      where: {
        id: attempt.id,
        status: 'IN_PROGRESS',
        currentLevel: level + 1,
        resolvedPicks: attempt.resolvedPicks,
      },
      data: {
        securedLevel: 0,
        securedRewardSnapshot: null,
        resolvedPicks: JSON.stringify(continuedHistory),
      },
    });
    if (updated.count !== 1) {
      const current = await tx.towerAttempt.findUnique({ where: { id: attempt.id }, include: { token: true } });
      const currentLatestPick = current ? parseJson<TowerPickRecord[]>(current.resolvedPicks, []).at(-1) : null;
      if (current && currentLatestPick?.level === level && currentLatestPick.continued === true) {
        return serializeAttempt(current, config.rewards, now);
      }
      throw new TowerError('ATTEMPT_ENDED', undefined, 409);
    }
    const continued = await tx.towerAttempt.findUniqueOrThrow({ where: { id: attempt.id }, include: { token: true } });
    return serializeAttempt(continued, config.rewards, now);
  });
}

export async function claimTowerReward(userId: string, attemptId: string, now: Date = new Date()) {
  if (!attemptId) throw new TowerError('INVALID_ATTEMPT', undefined, 404);
  for (let codeAttempt = 0; codeAttempt < 4; codeAttempt += 1) {
    const code = makeTicketCode();
    try {
      return await runSerializableTransaction(async (tx) => {
        const config = await getTowerConfig(tx);
        const attempt = await tx.towerAttempt.findUnique({ where: { id: attemptId }, include: { token: true } });
        if (!attempt) throw new TowerError('INVALID_ATTEMPT', undefined, 404);
        if (attempt.userId !== userId) throw new TowerError('FORBIDDEN', undefined, 403);
        const reward = parseJson<TowerPublicReward | null>(attempt.securedRewardSnapshot, null);
        const existingTicket = await tx.armoryTicket.findUnique({
          where: { source_sourceRefId: { source: 'TOWER', sourceRefId: attempt.id } },
        });
        if (existingTicket) return {
          success: true,
          reward,
          ticket: existingTicket,
          attempt: serializeAttempt(attempt, config.rewards, now),
        };
        if (isTowerTokenExpired(attempt.token.expiresAt, now)) throw new TowerError('TOWER_EXPIRED', undefined, 410);
        if (isTowerDeadlineReached(attempt.runExpiresAt, now)) throw new TowerError('TOWER_RUN_EXPIRED', undefined, 410);
        const latestPick = parseJson<TowerPickRecord[]>(attempt.resolvedPicks, []).at(-1);
        if (latestPick?.continued === true) throw new TowerError('CLIMB_COMMITTED', undefined, 409);
        if (!reward || attempt.securedLevel <= 0) throw new TowerError('NO_SECURED_REWARD');
        if (!['IN_PROGRESS', 'COMPLETED'].includes(attempt.status)) throw new TowerError('ATTEMPT_ENDED', undefined, 409);

        const rewardSnapshot = JSON.stringify({
          source: 'Tower of Rewards', rewardId: reward.id, rewardType: reward.type,
          description: reward.name, value: reward.value ?? null,
          discountPercentage: reward.type === 'DISCOUNT' ? reward.value ?? null : null,
          gamingMinutes: reward.type === 'GAMING_TIME' || reward.type === 'PASS' ? reward.value ?? null : null,
          racingMinutes: reward.type === 'RACING_TIME' ? reward.value ?? null : null,
          passType: reward.passType ?? null, towerLevel: attempt.securedLevel,
        });
        const claimedAttempt = await tx.towerAttempt.updateMany({
          where: { id: attempt.id, status: { in: ['IN_PROGRESS', 'COMPLETED'] }, resolvedPicks: attempt.resolvedPicks },
          data: { status: 'CLAIMED', completedAt: attempt.completedAt ?? now, claimedAt: now },
        });
        if (claimedAttempt.count !== 1) throw new TowerError('ATTEMPT_ENDED', undefined, 409);

        const ticket = await tx.armoryTicket.create({
          data: {
            userId, setId: null, code, status: 'UNUSED', source: 'TOWER', sourceRefId: attempt.id,
            claimDate: getArmoryToday(now), rewardSnapshot, expiresAt: attempt.token.expiresAt,
          },
        });
        const claimed = await tx.towerAttempt.findUniqueOrThrow({ where: { id: attempt.id }, include: { token: true } });
        return { success: true, reward, ticket, attempt: serializeAttempt(claimed, config.rewards, now) };
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }
  }
  throw new TowerError('TICKET_CODE_FAILED', undefined, 500);
}
