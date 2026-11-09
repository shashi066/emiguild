import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import { addIstDateDays, getIstDateKey, getNextIstMidnight, isValidIstDateKey } from './guess-36-clock';
import { fingerprint, receipt, requireCurrentUser, RewardError, rewardTransaction, type RewardTx } from './november';
import { mineTicketExpiry } from './guess-36-mines-rules';

export const GUESS_REVIEW_OPERATION = 'GUESS36_REVIEW';
const reviewKey = (date: string) => `guess_review_${date}`;
export type ExpeditionEligibility = {
  freeAvailable: boolean; bonuses: { id: string; expiresAt: string }[];
  review: { claimed: boolean; date: string; nextResetAt: string; serverNow: string };
};

export async function getMineEligibility(userId: string | null, now = new Date(), db: RewardTx = prisma): Promise<ExpeditionEligibility> {
  const date = getIstDateKey(now);
  if (!userId) return { freeAvailable: false, bonuses: [], review: { claimed: false, date, nextResetAt: getNextIstMidnight(now).toISOString(), serverNow: now.toISOString() } };
  const [free, grants] = await Promise.all([
    db.guess36Entry.findFirst({ where: { userId, attemptKey: 'FREE', round: { roundDate: date } }, select: { id: true } }),
    db.rewardReceipt.findMany({ where: { actorId: userId, operation: GUESS_REVIEW_OPERATION,
        requestId: { in: [reviewKey(addIstDateDays(date, -1)), reviewKey(date)] } },
      select: { id: true, requestId: true, response: true, guessEntry: { select: { id: true } } }, orderBy: { requestId: 'asc' } }),
  ]);
  return {
    freeAvailable: !free,
    bonuses: grants.filter(row => !row.guessEntry).map(row => ({ id: row.id, expiresAt: (JSON.parse(row.response) as { expiresAt: string }).expiresAt })).filter(row => Date.parse(row.expiresAt) > now.getTime()),
    review: { claimed: grants.some(row => row.requestId === reviewKey(date)), date, nextResetAt: getNextIstMidnight(now).toISOString(), serverNow: now.toISOString() },
  };
}

export async function grantGuessReviewBonus(userId: string, date: string, now = new Date()) {
  if (!isValidIstDateKey(date)) throw new RewardError('INVALID_DATE', 'Invalid review date.');
  return rewardTransaction(async tx => {
    await requireCurrentUser(userId, tx);
    const key = reviewKey(date);
    const replay = await receipt<{ id: string; expiresAt: string }>(tx, userId, GUESS_REVIEW_OPERATION, key, { date });
    if (replay) return { ...replay, created: false };
    if (date !== getIstDateKey(now)) throw new RewardError('STALE_DATE', 'A new day started. Refresh before claiming.', 409);
    if ((await tx.setting.findUnique({ where: { key: 'guess_36_mines_enabled' } }))?.value !== 'true') throw new RewardError('PAUSED', 'New runs are paused.', 403);
    const result = { id: randomUUID(), expiresAt: mineTicketExpiry(now).toISOString() };
    await tx.rewardReceipt.create({ data: { id: result.id, actorId: userId, operation: GUESS_REVIEW_OPERATION, requestId: key, fingerprint: fingerprint({ date }), response: JSON.stringify(result), createdAt: now } });
    return { ...result, created: true };
  });
}
