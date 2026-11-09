import crypto from 'node:crypto';
import type { Guess36Entry, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { armoryTransaction } from './armory-transaction';
import { receipt, saveReceipt, requestIdSchema, requireCurrentUser, RewardError } from './november';
import { getMineEligibility } from './guess-36-bonuses';
import { getIstDateKey, getNextIstMidnight } from './guess-36-clock';
import { serializeGuess36RewardTicket } from './guess-36';
import { MINE_RULES, generateMineBoard, parseMineBoard, parseMineRevealed, mineReward, mineTicketExpiry, type MineRun, type MineState, type MineStatus, type MineReward } from './guess-36-mines-rules';

export const MINES_ENABLED_KEY = 'guess_36_mines_enabled';
const SOURCE = 'GUESS_36';
type Tx = Prisma.TransactionClient;
type Entry = Guess36Entry & { round: { roundDate: string } };
function rulesFor(entry: Guess36Entry): typeof MINE_RULES {
  const rules = JSON.parse(entry.mineRules ?? 'null') as typeof MINE_RULES;
  if (!rules || rules.version !== MINE_RULES.version || rules.rewards.length !== 5) throw new Error('Invalid run rules');
  return rules;
}
export function publicMineRun(entry: Entry, ticket: { id: string; status: string; expiresAt: Date } | null = null, showBoard = false): MineRun {
  const board = parseMineBoard(entry.mineBoard);
  const revealed = parseMineRevealed(entry.mineRevealed);
  const greens = revealed.filter(i => board[i] === 'GREEN').length;
  const active = entry.mineStatus === 'ACTIVE';
  return { id: entry.id, date: entry.round.roundDate, status: entry.mineStatus as MineStatus,
    version: entry.mineVersion, startedAt: entry.mineStartedAt!.toISOString(), expiresAt: entry.mineExpiresAt!.toISOString(),
    settledAt: entry.mineSettledAt?.toISOString() ?? null,
    tiles: (showBoard && !active ? board.map((_, i) => i) : revealed).map(index => ({ index, color: board[index] })), greens,
    reward: entry.mineStatus === 'LOST' ? null : active ? mineReward(rulesFor(entry), greens) : entry.mineReward ? JSON.parse(entry.mineReward) as MineReward : null,
    nextReward: active && greens < 5 ? rulesFor(entry).rewards[greens] : null, ticketId: ticket?.id ?? null, ticket: ticket ? { id: ticket.id, status: ticket.status, expiresAt: ticket.expiresAt.toISOString() } : null };
}
async function ticketFor(tx: Tx, id: string) {
  return tx.armoryTicket.findUnique({ where: { source_sourceRefId: { source: SOURCE, sourceRefId: id } }, select: { id: true, status: true, expiresAt: true } });
}
async function settle(tx: Tx, entry: Entry, status: Exclude<MineStatus, 'ACTIVE'>, at: Date): Promise<Entry> {
  if (entry.mineStatus !== 'ACTIVE') return entry;
  const board = parseMineBoard(entry.mineBoard);
  const greens = parseMineRevealed(entry.mineRevealed).filter(i => board[i] === 'GREEN').length;
  const reward = status === 'LOST' ? null : mineReward(rulesFor(entry), greens);
  const changed = await tx.guess36Entry.updateMany({ where: { id: entry.id, mineStatus: 'ACTIVE', mineVersion: entry.mineVersion },
    data: { mineStatus: status, mineSettledAt: at, mineReward: reward ? JSON.stringify(reward) : null, mineVersion: { increment: 1 } } });
  if (changed.count !== 1) throw new RewardError('STALE_RUN', 'Your run changed. Check result.', 409);
  if (reward) await tx.armoryTicket.create({ data: { userId: entry.userId, setId: null,
    code: `G36-${crypto.randomBytes(9).toString('hex').toUpperCase()}`, source: SOURCE, sourceRefId: entry.id,
    claimDate: getIstDateKey(at), claimedAt: at, expiresAt: mineTicketExpiry(at),
    rewardSnapshot: JSON.stringify({ source: 'Guess 36 Guild Expedition', mode: 'MINES', reward,
      rewardType: reward.type, gamingMinutes: reward.type === 'GAMING_TIME' ? reward.value : undefined,
      passType: reward.type === 'PASS' ? 'BRONZE' : undefined, description: reward.name,
      roundDate: entry.round.roundDate, greens, rulesVersion: rulesFor(entry).version }) } });
  return tx.guess36Entry.findUniqueOrThrow({ where: { id: entry.id }, include: { round: { select: { roundDate: true } } } });
}
async function expire(tx: Tx, entry: Entry, now: Date) {
  return entry.mineStatus === 'ACTIVE' && entry.mineExpiresAt! <= now ? settle(tx, entry, 'TIMED_OUT', entry.mineExpiresAt!) : entry;
}
async function rate(tx: Tx, entry: Entry, now: Date) {
  const same = entry.mineRateAt && now.getTime() - entry.mineRateAt.getTime() < 60_000;
  if (same && entry.mineRateCount >= 90) throw new RewardError('RATE_LIMIT', 'Too many actions. Wait a moment and check result.', 429);
  return tx.guess36Entry.update({ where: { id: entry.id }, data: { mineRateAt: same ? entry.mineRateAt : now, mineRateCount: same ? { increment: 1 } : 1 }, include: { round: { select: { roundDate: true } } } });
}
async function loadOwned(tx: Tx, userId: string, id: string) {
  const entry = await tx.guess36Entry.findUnique({ where: { id }, include: { round: { select: { roundDate: true } } } });
  if (!entry || entry.userId !== userId || entry.gameMode !== 'MINES') throw new RewardError('NOT_FOUND', 'Run not found.', 404);
  return entry;
}
export async function revealMine(userId: string, input: { date: string; index: number; runId?: string; version?: number; requestId?: string }, clock: Date | (() => Date) = () => new Date(), randomInt = (max: number) => crypto.randomInt(max)) {
  if (!Number.isInteger(input.index) || input.index < 0 || input.index >= 36) throw new RewardError('INVALID_TILE', 'Choose a tile from 1-36.');
  return armoryTransaction(async tx => {
    const user = await requireCurrentUser(userId, tx);
    if (!['USER', 'ADMIN'].includes(user.role)) throw new RewardError('FORBIDDEN', 'Account not eligible to play.', 403);
    const now = typeof clock === 'function' ? clock() : clock;
    const startId = input.requestId ?? `guess_free_${input.date}`;
    const startPayload = input.requestId ? { date: input.date, index: input.index } : { date: input.date };
    if (!input.runId) {
      requestIdSchema.parse(startId);
      const replay = await receipt<{ runId: string }>(tx, userId, 'GUESS36_START', startId, startPayload);
      if (replay) { const recovered = await expire(tx, await loadOwned(tx, userId, replay.runId), now); return publicMineRun(recovered, await ticketFor(tx, recovered.id)); }
    }
    let started = false;
    let entry: Entry;
    if (input.runId) {
      entry = await loadOwned(tx, userId, input.runId);
      if (entry.round.roundDate !== input.date) throw new RewardError('STALE_DATE', 'Check your current run.', 409);
    } else {
      if (input.date !== getIstDateKey(now)) throw new RewardError('STALE_DATE', 'A new day started. Refresh before playing.', 409);
      // Another device or an older day may already have an active run. Never start two.
      const previous = await tx.guess36Entry.findFirst({ where: { userId, gameMode: 'MINES', mineStatus: 'ACTIVE' }, include: { round: { select: { roundDate: true } } } });
      if (previous) {
        const recovered = await expire(tx, previous, now);
        return publicMineRun(recovered, await ticketFor(tx, previous.id));
      }
      if ((await tx.setting.findUnique({ where: { key: MINES_ENABLED_KEY } }))?.value !== 'true') throw new RewardError('PAUSED', 'New runs are paused.', 403);
      const eligibility = await getMineEligibility(userId, now, tx);
      // Older clients without a durable request ID can only address their FREE attempt.
      const bonus = !eligibility.freeAvailable && input.requestId ? eligibility.bonuses[0] : undefined;
      if (!eligibility.freeAvailable && !bonus) throw new RewardError('DAILY_USED', 'Today is already played. Claim a review bonus or return tomorrow.', 409);
      let round = await tx.guess36Round.findUnique({ where: { roundDate: input.date } });
      if (!round) round = await tx.guess36Round.create({ data: { roundDate: input.date, minesSnapshot: JSON.stringify(MINE_RULES) } });
      else if (!round.minesSnapshot) round = await tx.guess36Round.update({ where: { id: round.id }, data: { minesSnapshot: JSON.stringify(MINE_RULES) } });
      entry = await tx.guess36Entry.create({ data: { roundId: round.id, userId, gameMode: 'MINES', selectionType: null,
        attemptKey: bonus ? `REVIEW:${bonus.id}` : 'FREE', reviewReceiptId: bonus?.id,
        mineBoard: JSON.stringify(generateMineBoard(randomInt)), mineStatus: 'ACTIVE', mineRules: round.minesSnapshot,
        mineStartedAt: now, mineExpiresAt: new Date(now.getTime() + 90_000) }, include: { round: { select: { roundDate: true } } } });
      started = true;
    }
    entry = await rate(tx, entry, now);
    entry = await expire(tx, entry, now);
    const revealed = parseMineRevealed(entry.mineRevealed);
    if (entry.mineStatus !== 'ACTIVE' || revealed.includes(input.index)) return publicMineRun(entry, await ticketFor(tx, entry.id));
    // A retried first request recovers the initial run; it cannot reveal another tile.
    if (!input.runId && revealed.length) return publicMineRun(entry);
    if (input.runId && input.version !== entry.mineVersion) throw new RewardError('STALE_RUN', 'Your run changed. Check result.', 409);
    revealed.push(input.index);
    const changed = await tx.guess36Entry.updateMany({ where: { id: entry.id, mineVersion: entry.mineVersion, mineStatus: 'ACTIVE' }, data: { mineRevealed: JSON.stringify(revealed), mineVersion: { increment: 1 } } });
    if (changed.count !== 1) throw new RewardError('STALE_RUN', 'Your run changed. Check result.', 409);
    entry = await loadOwned(tx, userId, entry.id);
    const board = parseMineBoard(entry.mineBoard);
    if (board[input.index] === 'RED') entry = await settle(tx, entry, 'LOST', now);
    else if (revealed.filter(i => board[i] === 'GREEN').length === 5) entry = await settle(tx, entry, 'COMPLETED', now);
    if (started) await saveReceipt(tx, userId, 'GUESS36_START', startId, startPayload, { runId: entry.id });
    return publicMineRun(entry, await ticketFor(tx, entry.id));
  });
}
export async function collectMine(userId: string, input: { runId: string; version: number }, clock: Date | (() => Date) = () => new Date()) {
  return armoryTransaction(async tx => {
    await requireCurrentUser(userId, tx);
    const now = typeof clock === 'function' ? clock() : clock;
    let entry = await rate(tx, await loadOwned(tx, userId, input.runId), now);
    entry = await expire(tx, entry, now);
    if (entry.mineStatus === 'ACTIVE') {
      if (input.version !== entry.mineVersion) throw new RewardError('STALE_RUN', 'Your run changed. Check result.', 409);
      if (!publicMineRun(entry).greens) throw new RewardError('NO_REWARD', 'Find a green tile to collect.');
      entry = await settle(tx, entry, 'COLLECTED', now);
    }
    return publicMineRun(entry, await ticketFor(tx, entry.id));
  });
}
export async function getMineState(userId: string | null, at?: Date, inspectId?: string, recoverId?: string, startRequestId?: string): Promise<MineState> {
  if ([inspectId, recoverId, startRequestId].filter(Boolean).length > 1) throw new RewardError('INVALID_VIEW', 'Choose recovery or board inspection.');
  if (startRequestId) {
    requestIdSchema.parse(startRequestId);
    if (!userId) throw new RewardError('UNAUTHORIZED', 'Sign in.', 401);
    await requireCurrentUser(userId);
    const saved = await prisma.rewardReceipt.findUnique({ where: { actorId_operation_requestId: { actorId: userId, operation: 'GUESS36_START', requestId: startRequestId } }, select: { response: true } });
    if (!saved) throw new RewardError('START_NOT_FOUND', 'No committed first reveal found. Retry the same tile.', 404);
    recoverId = (JSON.parse(saved.response) as { runId: string }).runId;
  }
  const now = at ?? new Date();
  const date = getIstDateKey(now);
  const enabled = (await prisma.setting.findUnique({ where: { key: MINES_ENABLED_KEY }, select: { value: true } }))?.value === 'true';
  let settled: Entry | null = null;
  if (userId) {
    await requireCurrentUser(userId);
    // Only open a write transaction when there is actually an expired run.
    const expired = await prisma.guess36Entry.findMany({ where: { userId, gameMode: 'MINES', mineStatus: 'ACTIVE', mineExpiresAt: { lte: now } }, select: { id: true }, orderBy: { mineStartedAt: 'desc' }, take: 2 });
    for (const row of expired) {
      const result = await armoryTransaction(async tx => expire(tx, await loadOwned(tx, userId, row.id), now));
      settled ??= result;
    }
  }
  const [today, active, tickets] = await Promise.all([
    userId ? prisma.guess36Entry.findFirst({ where: { userId, round: { roundDate: date } }, orderBy: [{ mineStartedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], include: { round: { select: { roundDate: true } } } }) : null,
    userId ? prisma.guess36Entry.findFirst({ where: { userId, gameMode: 'MINES', mineStatus: 'ACTIVE' }, include: { round: { select: { roundDate: true } } } }) : null,
    userId ? prisma.armoryTicket.findMany({ where: { userId, source: SOURCE, status: 'UNUSED', expiresAt: { gt: now } }, select: { id: true, rewardSnapshot: true, expiresAt: true }, orderBy: { claimedAt: 'desc' }, take: 20 }) : [],
  ]);
  // A fresh load restores live runs; finished runs use explicit owned recovery.
  // Keep a just-settled timeout visible while confirming its secured reward.
  let current = active ?? settled;
  const selectedId = inspectId ?? recoverId;
  if (selectedId) {
    if (!userId) throw new RewardError('UNAUTHORIZED', 'Sign in.', 401);
    const inspect = await prisma.guess36Entry.findUnique({ where: { id: selectedId }, include: { round: { select: { roundDate: true } } } });
    if (!inspect || inspect.userId !== userId || inspect.gameMode !== 'MINES') throw new RewardError('NOT_FOUND', 'Run not found.', 404);
    if (inspectId && inspect.mineStatus === 'ACTIVE') throw new RewardError('ACTIVE_BOARD', 'Finish the run before viewing its board.', 409);
    current = inspect;
  }
  const ticket = current ? await prisma.armoryTicket.findUnique({
    where: { source_sourceRefId: { source: SOURCE, sourceRefId: current.id } },
    select: { id: true, status: true, expiresAt: true },
  }) : null;
  return { mode: 'MINES', enabled, authenticated: !!userId, serverNow: (at ?? new Date()).toISOString(), date, nextDayAt: getNextIstMidnight(now).toISOString(),
    recoveryKey: userId ? crypto.createHash('sha256').update(`expedition:${userId}`).digest('hex') : null,
    eligibility: await getMineEligibility(userId, now),
    legacyUsedToday: today?.gameMode === 'LEGACY', rules: MINE_RULES,
    run: current ? publicMineRun(current, ticket, !!inspectId) : null,
    rewardTickets: tickets.map(serializeGuess36RewardTicket) };
}

export async function getMineAdmin(page = 1, now = new Date()) {
  const [enabled, rows, total] = await Promise.all([
    prisma.setting.findUnique({ where: { key: MINES_ENABLED_KEY }, select: { value: true } }),
    prisma.guess36Entry.findMany({ where: { gameMode: 'MINES' }, select: { id: true, user: { select: { name: true, email: true } }, round: { select: { roundDate: true } }, mineStatus: true, mineRevealed: true, mineBoard: true, mineReward: true, mineStartedAt: true, mineExpiresAt: true, mineSettledAt: true }, orderBy: { createdAt: 'desc' }, take: 20, skip: (page - 1) * 20 }),
    prisma.guess36Entry.count({ where: { gameMode: 'MINES' } }),
  ]);
  const tickets = await prisma.armoryTicket.findMany({ where: { source: SOURCE, sourceRefId: { in: rows.map(r => r.id) } }, select: { id: true, sourceRefId: true, code: true, expiresAt: true, status: true } });
  const byEntry = new Map(tickets.map(t => [t.sourceRefId, t]));
  return { enabled: enabled?.value === 'true', page, total, rules: MINE_RULES, rows: rows.map(r => {
    const board = parseMineBoard(r.mineBoard);
    const ticket = byEntry.get(r.id);
    return { id: r.id, member: r.user, date: r.round.roundDate,
      status: r.mineStatus === 'ACTIVE' && r.mineExpiresAt! <= now ? 'AWAITING_SETTLEMENT' : r.mineStatus,
      greens: parseMineRevealed(r.mineRevealed).filter(i => board[i] === 'GREEN').length,
      reward: r.mineReward ? JSON.parse(r.mineReward) as MineReward : null,
      startedAt: r.mineStartedAt?.toISOString(), settledAt: r.mineSettledAt?.toISOString(),
      ticket: ticket ? { id: ticket.id, code: ticket.code, status: ticket.status, expiresAt: ticket.expiresAt.toISOString() } : null };
  }) };
}
export type MineAdminData = Awaited<ReturnType<typeof getMineAdmin>>;
