import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import { creditEmicUnits, EMIC_UNIT_FACTOR } from '@/lib/emic';
import {
  getIstDateKey,
  getGuess36TicketExpiry,
  getGuess36EntryCutoff,
  getNextIstMidnight,
  getPreviousIstDateKey,
  isValidIstDateKey,
  isGuess36EntryOpen,
  addIstDateDays,
} from '@/lib/guess-36-clock';
import {
  DEFAULT_GUESS_36_REWARDS,
  DEFAULT_GUESS_36_MODES,
  guess36SelectionMatches,
  guess36Tier,
  guess36WinningSelections,
  normalizeGuess36Rewards,
  normalizeGuess36Reward,
  normalizeGuess36Modes,
  parseGuess36Selection,
} from '@/lib/guess-36-rules';
import type {
  Guess36AdminData,
  Guess36AdminItem,
  Guess36PublicState,
  Guess36PublicTicket,
  Guess36AdminTicket,
  Guess36Reward,
  Guess36CounterReward,
  Guess36Config,
  Guess36PublicEntry,
  Guess36Rewards,
  Guess36Selection,
} from '@/lib/guess-36-types';

export const GUESS_36_ENABLED_KEY = 'guess_36_enabled';
export const GUESS_36_REWARDS_KEY = 'guess_36_rewards';
export const GUESS_36_MODES_KEY = 'guess_36_modes';
const TICKET_SOURCE = 'GUESS_36';
const MAX_ADMIN_PAGE_SIZE = 50;

type DbClient = Prisma.TransactionClient | typeof prisma;

async function runGuess36Transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await runSerializableTransaction(work); }
    catch (error) {
      // Concurrent first visits can both try creating the same daily round.
      if (!isUniqueConstraintError(error) || attempt === 2) throw error;
    }
  }
}

export class Guess36Error extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
    readonly existingEntry?: Guess36PublicEntry,
  ) {
    super(code);
  }
}

export function friendlyGuess36Error(error: unknown) {
  if (error instanceof Guess36Error) {
    const messages: Record<string, string> = {
      INVALID_SELECTION: 'Choose one number from 1-36, Even, Odd, or a range.',
      INVALID_CONFIG: 'Choose valid rewards for all three tiers.',
      INVALID_MODES: 'Enable at least one valid Guess 36 pick type.',
      MODE_DISABLED: 'This pick type is not available today. Choose another option.',
      ALREADY_ENTERED: "You've already made your pick today.",
      STALE_ROUND: 'A new day has started. Refresh to see today\'s rewards before choosing.',
      ROUND_CLOSED: "Today's picks are closed. Come back tomorrow!",
      GUESS_36_DISABLED: 'Guess 36 is paused right now.',
      PLAYER_ONLY: 'Sign in with an eligible account to make a pick.',
      INVALID_ROUND_DATE: 'Choose a valid round date.',
      DRAW_NOT_AVAILABLE: 'Only a past round can be drawn.',
      TICKET_NOT_FOUND: 'Reward Ticket not found.',
      TICKET_EXPIRED: 'This Reward Ticket has expired.',
    };
    return {
      error: messages[error.code] ?? 'Guess 36 action failed.',
      code: error.code,
      status: error.status,
      existingEntry: error.existingEntry,
    };
  }
  return { error: 'Something went wrong. Please try again.', code: 'UNKNOWN', status: 500 };
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function makeTicketCode() {
  return `G36-${crypto.randomBytes(9).toString('hex').toUpperCase()}`;
}

function maskPhone(phone: string | null) {
  if (!phone) return '-';
  const digits = phone.replace(/\D/g, '');
  return digits ? `****${digits.slice(-4)}` : '-';
}

function ticketReward(rewardSnapshot: string): Guess36CounterReward {
  const snapshot = JSON.parse(rewardSnapshot);
  // Existing one-hour tickets retain their original description and value.
  const reward = snapshot.reward
    ? normalizeGuess36Reward(snapshot.reward)
    : { type: 'GAMING_TIME' as const, value: snapshot.gamingMinutes ?? 60, name: snapshot.description ?? '60 Minutes Gaming' };
  if (reward.type === 'EMIC') throw new Guess36Error('TICKET_NOT_FOUND', 500);
  return reward;
}

function serializePublicTicket(ticket: {
  id: string;
  expiresAt: Date;
  rewardSnapshot: string;
}): Guess36PublicTicket {
  return { id: ticket.id, expiresAt: ticket.expiresAt.toISOString(), reward: ticketReward(ticket.rewardSnapshot) };
}

function serializeTicket(ticket: {
  id: string;
  code: string;
  status: string;
  expiresAt: Date;
  rewardSnapshot: string;
}, now: Date): Guess36AdminTicket {
  const status = ticket.status === 'REDEEMED'
    ? 'REDEEMED'
    : ticket.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'UNUSED';
  return { ...serializePublicTicket(ticket), code: ticket.code, status };
}

const entrySelect = { selectionType: true, selectionValue: true, createdAt: true } as const;
const ticketSelect = { id: true, code: true, status: true, expiresAt: true, rewardSnapshot: true } as const;

function entrySelection(entry: { selectionType: string; selectionValue: number | null }): Guess36Selection {
  const selection = parseGuess36Selection(entry.selectionType === 'EVEN' || entry.selectionType === 'ODD'
    ? { type: entry.selectionType }
    : { type: entry.selectionType, value: entry.selectionValue });
  if (!selection) throw new Guess36Error('INVALID_SELECTION', 500);
  return selection;
}

function serializeEntry(entry: { selectionType: string; selectionValue: number | null; createdAt: Date }): Guess36PublicEntry {
  return { selection: entrySelection(entry), createdAt: entry.createdAt.toISOString() };
}

function winningEntries(roundId: string, winningNumber: number): Prisma.Guess36EntryWhereInput {
  return {
    roundId,
    OR: guess36WinningSelections(winningNumber).map((selection) => ({
      selectionType: selection.type, selectionValue: 'value' in selection ? selection.value : null,
    })),
  };
}

function roundRewards(round: { rewardsSnapshot: string | null }): Guess36Rewards {
  return round.rewardsSnapshot ? normalizeGuess36Rewards(JSON.parse(round.rewardsSnapshot)) : DEFAULT_GUESS_36_REWARDS;
}

function effectiveRoundStatus(
  roundDate: string,
  status: string | undefined,
  enabled: boolean,
  today: string,
  now: Date,
) {
  if (status === 'DRAWN') return 'DRAWN' as const;
  if (roundDate < today) return 'CLOSED' as const;
  if (roundDate === today && !isGuess36EntryOpen(now)) return 'CLOSED' as const;
  if (!enabled) return 'PAUSED' as const;
  return status === 'CLOSED' ? 'CLOSED' as const : 'OPEN' as const;
}

async function readEnabled(db: DbClient = prisma) {
  const setting = await db.setting.findUnique({ where: { key: GUESS_36_ENABLED_KEY } });
  return setting?.value !== 'false';
}

async function readModes(db: DbClient = prisma) {
  const setting = await db.setting.findUnique({ where: { key: GUESS_36_MODES_KEY }, select: { value: true } });
  if (!setting) return DEFAULT_GUESS_36_MODES;
  try { return normalizeGuess36Modes(JSON.parse(setting.value)); }
  catch { return DEFAULT_GUESS_36_MODES; }
}

export async function ensureGuess36Config() {
  const existing = await prisma.setting.findMany({
    where: { key: { in: [GUESS_36_ENABLED_KEY, GUESS_36_REWARDS_KEY, GUESS_36_MODES_KEY] } }, select: { key: true },
  });
  for (const setting of [
    { key: GUESS_36_ENABLED_KEY, value: 'true', label: 'Guess 36 Enabled' },
    { key: GUESS_36_REWARDS_KEY, value: JSON.stringify(DEFAULT_GUESS_36_REWARDS), label: 'Guess 36 Rewards' },
    { key: GUESS_36_MODES_KEY, value: JSON.stringify(DEFAULT_GUESS_36_MODES), label: 'Guess 36 Pick Types' },
  ]) {
    if (!existing.some(({ key }) => key === setting.key)) {
      await prisma.setting.upsert({ where: { key: setting.key }, update: {}, create: setting });
    }
  }
}

async function readRewards(db: DbClient = prisma): Promise<Guess36Rewards> {
  const setting = await db.setting.findUnique({ where: { key: GUESS_36_REWARDS_KEY }, select: { value: true } });
  return setting ? normalizeGuess36Rewards(JSON.parse(setting.value)) : DEFAULT_GUESS_36_REWARDS;
}

async function getOrCreateRound(db: DbClient, roundDate: string) {
  const existing = await db.guess36Round.findUnique({ where: { roundDate } });
  if (existing?.rewardsSnapshot) return existing;
  if (existing) {
    await db.guess36Round.updateMany({
      where: { id: existing.id, rewardsSnapshot: null },
      data: { rewardsSnapshot: JSON.stringify(DEFAULT_GUESS_36_REWARDS) },
    });
    return db.guess36Round.findUniqueOrThrow({ where: { roundDate } });
  }
  return db.guess36Round.create({
    data: { roundDate, rewardsSnapshot: JSON.stringify(await readRewards(db)) },
  });
}

async function ensureTodayRound(now: Date) {
  const roundDate = getIstDateKey(now);
  const existing = await prisma.guess36Round.findUnique({ where: { roundDate } });
  if (existing?.rewardsSnapshot) return existing;
  try {
    return await runSerializableTransaction((tx) => getOrCreateRound(tx, roundDate));
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    return prisma.guess36Round.findUniqueOrThrow({ where: { roundDate } });
  }
}

export async function getGuess36Config(now = new Date()): Promise<Guess36Config> {
  const [enabled, enabledModes, rewards, todayRound] = await Promise.all([readEnabled(), readModes(), readRewards(), ensureTodayRound(now)]);
  return { enabled, enabledModes, rewards, todayRewards: roundRewards(todayRound), effectiveFrom: addIstDateDays(getIstDateKey(now), 1) };
}

export async function updateGuess36Config(value: { enabled?: boolean; enabledModes?: unknown; rewards?: unknown }, now = new Date()): Promise<Guess36Config> {
  if (!value || typeof value !== 'object' || Object.keys(value).some((key) => !['enabled', 'enabledModes', 'rewards'].includes(key))
    || (value.enabled === undefined && value.enabledModes === undefined && value.rewards === undefined)
    || (value.enabled !== undefined && typeof value.enabled !== 'boolean')) throw new Guess36Error('INVALID_CONFIG');
  let rewards: Guess36Rewards | undefined;
  let enabledModes;
  try { rewards = value.rewards === undefined ? undefined : normalizeGuess36Rewards(value.rewards); }
  catch { throw new Guess36Error('INVALID_CONFIG'); }
  try { enabledModes = value.enabledModes === undefined ? undefined : normalizeGuess36Modes(value.enabledModes); }
  catch { throw new Guess36Error('INVALID_MODES'); }
  await runGuess36Transaction(async (tx) => {
    // Freeze today's offer before changing the configuration used by future rounds.
    if (rewards) await getOrCreateRound(tx, getIstDateKey(now));
    if (value.enabled !== undefined) await tx.setting.upsert({
      where: { key: GUESS_36_ENABLED_KEY }, update: { value: String(value.enabled) },
      create: { key: GUESS_36_ENABLED_KEY, value: String(value.enabled), label: 'Guess 36 Enabled' },
    });
    if (rewards) await tx.setting.upsert({
      where: { key: GUESS_36_REWARDS_KEY }, update: { value: JSON.stringify(rewards) },
      create: { key: GUESS_36_REWARDS_KEY, value: JSON.stringify(rewards), label: 'Guess 36 Rewards' },
    });
    if (enabledModes) await tx.setting.upsert({
      where: { key: GUESS_36_MODES_KEY }, update: { value: JSON.stringify(enabledModes) },
      create: { key: GUESS_36_MODES_KEY, value: JSON.stringify(enabledModes), label: 'Guess 36 Pick Types' },
    });
  });
  return getGuess36Config(now);
}

export async function getGuess36Current(
  viewer?: { id: string; role: string } | null,
  now: Date = new Date(),
): Promise<Guess36PublicState> {
  const [enabled, enabledModes, todayRound] = await Promise.all([
    readEnabled(),
    readModes(),
    ensureTodayRound(now),
  ]);
  const today = getIstDateKey(now);
  const previousDate = getPreviousIstDateKey(now);
  const [previousRound, history, rewardTickets] = await Promise.all([
    prisma.guess36Round.findUnique({
      where: { roundDate: previousDate },
      select: { id: true, status: true, winningNumber: true, publishedAt: true, rewardsSnapshot: true },
    }),
    prisma.guess36Round.findMany({
      where: { status: 'DRAWN', roundDate: { lt: today }, winningNumber: { not: null }, publishedAt: { lte: now } },
      select: { roundDate: true, winningNumber: true },
      orderBy: { roundDate: 'desc' },
      take: 10,
    }),
    viewer ? prisma.armoryTicket.findMany({
      where: { userId: viewer.id, source: TICKET_SOURCE, status: 'UNUSED', expiresAt: { gt: now } },
      select: { id: true, rewardSnapshot: true, expiresAt: true },
      orderBy: [{ claimedAt: 'desc' }, { id: 'desc' }],
      take: 10,
    }) : Promise.resolve([]),
  ]);

  const todayEntryPromise = viewer
    ? prisma.guess36Entry.findUnique({
      where: { roundId_userId: { roundId: todayRound.id, userId: viewer.id } },
      select: entrySelect,
    })
    : Promise.resolve(null);
  const previousEntryPromise = viewer && previousRound
    ? prisma.guess36Entry.findUnique({
      where: { roundId_userId: { roundId: previousRound.id, userId: viewer.id } },
      select: { id: true, ...entrySelect },
    })
    : Promise.resolve(null);
  const [todayEntry, previousEntry] = await Promise.all([todayEntryPromise, previousEntryPromise]);
  const previousSelection = previousEntry ? entrySelection(previousEntry) : null;

  const drawn = previousRound?.status === 'DRAWN' && previousRound.winningNumber !== null
    && previousRound.publishedAt !== null && previousRound.publishedAt.getTime() <= now.getTime();
  let reward: Guess36Reward | null = null;
  if (drawn && previousRound && previousEntry && previousSelection
    && guess36SelectionMatches(previousSelection, previousRound.winningNumber!)) {
    reward = roundRewards(previousRound)[guess36Tier(previousSelection)];
  }

  const outcome = !drawn
    ? 'PENDING'
    : !previousEntry
      ? 'NOT_ENTERED'
      : guess36SelectionMatches(previousSelection!, previousRound!.winningNumber!) ? 'WIN' : 'LOSS';

  return {
    enabled,
    enabledModes,
    serverNow: now.toISOString(),
    authenticated: Boolean(viewer),
    eligible: viewer?.role === 'USER' || viewer?.role === 'ADMIN',
    history: history.map((round) => ({ date: round.roundDate, winningNumber: round.winningNumber! })),
    rewardTickets: rewardTickets.map(serializePublicTicket),
    today: {
      date: today,
      status: effectiveRoundStatus(today, todayRound.status, enabled, today, now) as 'OPEN' | 'PAUSED' | 'CLOSED',
      nextRoundAt: getNextIstMidnight(now).toISOString(),
      entryClosesAt: getGuess36EntryCutoff(now).toISOString(),
      rewards: roundRewards(todayRound),
      entry: todayEntry ? serializeEntry(todayEntry) : null,
    },
    previous: {
      date: previousDate,
      status: drawn ? 'DRAWN' : 'PENDING',
      winningNumber: drawn ? previousRound!.winningNumber : null,
      myPick: previousSelection,
      outcome,
      reward,
    },
  };
}

export async function createGuess36Entry(userId: string, input: { roundDate: string; selection: unknown }, now: Date = new Date()) {
  const selection = parseGuess36Selection(input?.selection);
  if (!selection || selection.type === 'ROW') throw new Guess36Error('INVALID_SELECTION');
  const roundDate = getIstDateKey(now);
  if (input.roundDate !== roundDate) throw new Guess36Error('STALE_ROUND', 409);
  if (!isGuess36EntryOpen(now)) throw new Guess36Error('ROUND_CLOSED', 409);

  try {
    return await runGuess36Transaction(async (tx) => {
      const [enabled, user] = await Promise.all([
        readEnabled(tx),
        tx.user.findUnique({ where: { id: userId }, select: { role: true } }),
      ]);
      if (!user || !['USER', 'ADMIN'].includes(user.role)) throw new Guess36Error('PLAYER_ONLY', 403);
      if (!enabled) throw new Guess36Error('GUESS_36_DISABLED', 403);
      const enabledModes = await readModes(tx);
      const selectionMode = selection.type === 'NUMBER' ? 'NUMBER'
        : selection.type === 'EVEN' || selection.type === 'ODD' ? 'PARITY' : 'RANGE';
      if (!enabledModes.includes(selectionMode)) throw new Guess36Error('MODE_DISABLED', 409);
      const round = await getOrCreateRound(tx, roundDate);
      if (round.roundDate !== roundDate || round.status !== 'OPEN') throw new Guess36Error('ROUND_CLOSED', 409);
      const existing = await tx.guess36Entry.findUnique({
        where: { roundId_userId: { roundId: round.id, userId } },
        select: entrySelect,
      });
      if (existing) throw new Guess36Error('ALREADY_ENTERED', 409, serializeEntry(existing));
      const entry = await tx.guess36Entry.create({
        data: { roundId: round.id, userId, selectionType: selection.type, selectionValue: 'value' in selection ? selection.value : null },
        select: { id: true, ...entrySelect },
      });
      return { id: entry.id, ...serializeEntry(entry) };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const round = await prisma.guess36Round.findUnique({ where: { roundDate } });
    const existing = round && await prisma.guess36Entry.findUnique({
      where: { roundId_userId: { roundId: round.id, userId } },
      select: entrySelect,
    });
    if (existing) throw new Guess36Error('ALREADY_ENTERED', 409, serializeEntry(existing));
    throw error;
  }
}

function validatePastRoundDate(roundDate: string, now: Date) {
  if (!isValidIstDateKey(roundDate)) throw new Guess36Error('INVALID_ROUND_DATE');
  if (roundDate >= getIstDateKey(now)) throw new Guess36Error('DRAW_NOT_AVAILABLE', 409);
}

async function getDrawResult(db: DbClient, roundDate: string) {
  const round = await db.guess36Round.findUniqueOrThrow({ where: { roundDate } });
  const winnerCount = round.winningNumber === null ? 0 : await db.guess36Entry.count({
    where: winningEntries(round.id, round.winningNumber),
  });
  return {
    roundDate: round.roundDate,
    status: round.status,
    winningNumber: round.winningNumber,
    winnerCount,
    generatedAt: round.generatedAt?.toISOString() ?? null,
  };
}

export async function drawGuess36Round(
  roundDate: string,
  now: Date = new Date(),
  options: { randomInt?: (minimum: number, maximum: number) => number } = {},
) {
  validatePastRoundDate(roundDate, now);
  const winningNumber = (options.randomInt ?? crypto.randomInt)(1, 37);
  if (!Number.isInteger(winningNumber) || winningNumber < 1 || winningNumber > 36) throw new Guess36Error('INVALID_SELECTION');

  for (let codeAttempt = 0; codeAttempt < 4; codeAttempt += 1) {
    try {
      return await runSerializableTransaction(async (tx) => {
        const round = await getOrCreateRound(tx, roundDate);
        if (round.status === 'DRAWN' && round.winningNumber !== null) return getDrawResult(tx, roundDate);

        const winners = await tx.guess36Entry.findMany({
          where: winningEntries(round.id, winningNumber),
          select: { id: true, userId: true, ...entrySelect },
        });
        const locked = await tx.guess36Round.updateMany({
          where: { id: round.id, winningNumber: null, status: { not: 'DRAWN' } },
          data: { status: 'DRAWN', winningNumber, generatedAt: now, publishedAt: now },
        });
        if (locked.count !== 1) return getDrawResult(tx, roundDate);

        const rewards = roundRewards(round);
        if (winners.length > 0) {
          const ticketWinners = [];
          for (const winner of winners) {
            const selection = entrySelection(winner);
            const tier = guess36Tier(selection);
            const reward = rewards[tier];
            if (reward.type === 'EMIC') {
              await creditEmicUnits({
                userId: winner.userId,
                amountUnits: reward.value * EMIC_UNIT_FACTOR,
                reason: 'GUESS_36_REWARD',
                note: `${winner.id}:${roundDate}:${tier}`,
              }, tx);
              continue;
            }
            ticketWinners.push({
              userId: winner.userId,
              setId: null,
              code: makeTicketCode(),
              status: 'UNUSED',
              source: TICKET_SOURCE,
              sourceRefId: winner.id,
              claimDate: getIstDateKey(now),
              rewardSnapshot: JSON.stringify({
                source: 'Guess 36',
                reward,
                rewardType: reward.type,
                gamingMinutes: reward.type === 'GAMING_TIME' ? reward.value : undefined,
                racingMinutes: reward.type === 'RACING_TIME' ? reward.value : undefined,
                discountPercentage: reward.type === 'DISCOUNT' ? reward.value : undefined,
                description: reward.name,
                tier,
                roundDate,
                winningNumber,
              }),
              expiresAt: getGuess36TicketExpiry(now),
            });
          }
          if (ticketWinners.length > 0) await tx.armoryTicket.createMany({ data: ticketWinners });
        }
        return getDrawResult(tx, roundDate);
      });
    } catch (error) {
      if (!isUniqueConstraintError(error) || codeAttempt === 3) throw error;
    }
  }
  throw new Guess36Error('TICKET_CODE_FAILED', 500);
}

async function getAdminSummary(enabled: boolean, now: Date) {
  const today = getIstDateKey(now);
  const previousDate = getPreviousIstDateKey(now);
  const [todayRound, previousRound] = await Promise.all([
    prisma.guess36Round.findUnique({ where: { roundDate: today }, select: { id: true, status: true } }),
    prisma.guess36Round.findUnique({ where: { roundDate: previousDate }, select: { id: true, status: true, winningNumber: true } }),
  ]);
  const [participants, winnerCount] = await Promise.all([
    todayRound ? prisma.guess36Entry.count({ where: { roundId: todayRound.id } }) : 0,
    previousRound?.winningNumber !== null && previousRound?.winningNumber !== undefined
      ? prisma.guess36Entry.count({ where: winningEntries(previousRound.id, previousRound.winningNumber) })
      : 0,
  ]);
  const previousDrawn = previousRound?.status === 'DRAWN' && previousRound.winningNumber !== null;
  return {
    today: {
      date: today,
      participants,
      status: effectiveRoundStatus(today, todayRound?.status, enabled, today, now) as 'OPEN' | 'PAUSED' | 'CLOSED',
    },
    previous: {
      date: previousDate,
      winningNumber: previousDrawn ? previousRound.winningNumber : null,
      winnerCount,
      status: previousDrawn ? 'DRAWN' as const : 'PENDING' as const,
    },
  };
}

export async function getGuess36AdminData(options: {
  roundDate?: string;
  view?: string;
  cursor?: string;
  take?: number;
  now?: Date;
} = {}): Promise<Guess36AdminData> {
  const now = options.now ?? new Date();
  const today = getIstDateKey(now);
  const roundDate = options.roundDate ?? today;
  if (!isValidIstDateKey(roundDate) || roundDate > today) throw new Guess36Error('INVALID_ROUND_DATE');
  const view = options.view === 'winners' ? 'winners' : 'entries';
  const requestedTake = options.take ?? 25;
  const take = Number.isFinite(requestedTake) ? Math.min(MAX_ADMIN_PAGE_SIZE, Math.max(1, Math.trunc(requestedTake))) : 25;
  const enabled = await readEnabled();
  const [summary, round] = await Promise.all([
    getAdminSummary(enabled, now),
    prisma.guess36Round.findUnique({ where: { roundDate } }),
  ]);
  const participantCount = round ? await prisma.guess36Entry.count({ where: { roundId: round.id } }) : 0;
  const winnerCount = round?.winningNumber !== null && round?.winningNumber !== undefined
    ? await prisma.guess36Entry.count({ where: winningEntries(round.id, round.winningNumber) })
    : 0;
  const where: Prisma.Guess36EntryWhereInput = round ? {
    roundId: round.id,
    ...(view === 'winners'
      ? round.status !== 'DRAWN' || round.winningNumber === null ? { id: '__none__' } : winningEntries(round.id, round.winningNumber)
      : {}),
  } : { id: '__none__' };
  const entries = await prisma.guess36Entry.findMany({
    where,
    select: {
      id: true,
      ...entrySelect,
      user: { select: { name: true, phone: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });
  const hasMore = entries.length > take;
  const pageEntries = hasMore ? entries.slice(0, take) : entries;
  const tickets = round?.status === 'DRAWN' && pageEntries.length > 0
    ? await prisma.armoryTicket.findMany({
      where: { source: TICKET_SOURCE, sourceRefId: { in: pageEntries.map((entry) => entry.id) } },
      select: { ...ticketSelect, sourceRefId: true },
    })
    : [];
  const ticketsByEntry = new Map(tickets.map((ticket) => [ticket.sourceRefId, ticket]));
  const items: Guess36AdminItem[] = pageEntries.map((entry) => {
    const ticketRecord = ticketsByEntry.get(entry.id);
    const selection = entrySelection(entry);
    const tier = guess36Tier(selection);
    return {
      id: entry.id,
      name: entry.user.name,
      phone: maskPhone(entry.user.phone),
      selection,
      tier,
      reward: ticketRecord ? serializeTicket(ticketRecord, now).reward : roundRewards(round!)[tier],
      enteredAt: entry.createdAt.toISOString(),
      ticket: ticketRecord ? serializeTicket(ticketRecord, now) : null,
    };
  });

  return {
    summary,
    round: {
      date: roundDate,
      status: round?.status === 'DRAWN'
        ? 'DRAWN'
        : effectiveRoundStatus(roundDate, round?.status, enabled, today, now),
      winningNumber: round?.status === 'DRAWN' ? round.winningNumber : null,
      participantCount,
      winnerCount,
      generatedAt: round?.generatedAt?.toISOString() ?? null,
    },
    view,
    items,
    nextCursor: hasMore ? pageEntries.at(-1)?.id ?? null : null,
  };
}

export async function redeemGuess36Ticket(ticketId: string, now: Date = new Date()) {
  return runSerializableTransaction(async (tx) => {
    const ticket = await tx.armoryTicket.findUnique({
      where: { id: ticketId },
      select: { ...ticketSelect, source: true },
    });
    if (!ticket || ticket.source !== TICKET_SOURCE) throw new Guess36Error('TICKET_NOT_FOUND', 404);
    if (ticket.status === 'REDEEMED') return serializeTicket(ticket, now);
    if (ticket.expiresAt.getTime() <= now.getTime()) throw new Guess36Error('TICKET_EXPIRED', 410);
    const updated = await tx.armoryTicket.updateMany({
      where: { id: ticket.id, status: 'UNUSED', expiresAt: { gt: now } },
      data: { status: 'REDEEMED', redeemedAt: now },
    });
    if (updated.count !== 1) {
      const current = await tx.armoryTicket.findUniqueOrThrow({
        where: { id: ticket.id },
        select: ticketSelect,
      });
      if (current.status === 'REDEEMED') return serializeTicket(current, now);
      throw new Guess36Error('TICKET_EXPIRED', 410);
    }
    const redeemed = await tx.armoryTicket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: ticketSelect,
    });
    return serializeTicket(redeemed, now);
  });
}
