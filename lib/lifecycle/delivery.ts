import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { DAY, digestPeriod, MessageCandidate } from './rules';
import { getMessagingSettings } from './settings';
import { loadEmailEvaluation } from './evaluation';
import { emailConfiguration, gmailLifecycleTransport, lifecycleUnsubscribeSecret, MailTransport, renderLifecycleEmail, signUnsubscribe } from './email';

const LEASE_MS = 5 * 60_000;
const DELIVERY_RETENTION_MS = 8 * DAY;
export const CRON_LOCK_KEY = 'lifecycle_email_cron_lock';
export const CRON_CURSOR_KEY = 'lifecycle_email_cursor';
export function lifecycleDay(now: Date) { return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10); }
function dayStart(now: Date) { return new Date(lifecycleDay(now) + 'T00:00:00+05:30'); }
export type DeliveryOptions = { now?: Date; transport?: MailTransport; siteUrl?: string; secret?: string; testMode?: boolean };

// Transactions only reserve a send; SMTP always runs after commit.
async function createSend(userId: string, recipient: string, candidate: MessageCandidate, key: string, now: Date, test = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, include: { lifecycleEmailState: true } });
        if (!user || user.email !== recipient) return null;
        if (!test) {
          if (user.role !== 'USER' || user.lifecycleEmailState?.unsubscribedAt || (user.lastWebsiteVisitAt && now.getTime() - user.lastWebsiteVisitAt.getTime() < 3 * DAY)) return null;
          const switchKey = candidate.campaign === 'DIGEST' ? 'lifecycle_email_digest' : 'lifecycle_comeback_email';
          if ((await tx.setting.findUnique({ where: { key: switchKey } }))?.value !== 'true') return null;
          if (await tx.lifecycleEmailDelivery.count({ where: { userId, campaign: { not: 'TEST' }, status: { in: ['SENDING', 'ACCEPTED', 'UNKNOWN'] }, dispatchedAt: { gt: new Date(now.getTime() - 7 * DAY) } } })) return null;
        } else if (user.role !== 'ADMIN' || await tx.lifecycleEmailDelivery.count({ where: { userId, campaign: 'TEST', dispatchedAt: { gte: dayStart(now), lt: new Date(dayStart(now).getTime() + DAY) } } }) >= 3) return null;
        if (await tx.lifecycleEmailDelivery.count({ where: { dispatchedAt: { gte: dayStart(now), lt: new Date(dayStart(now).getTime() + DAY) } } }) >= 50) return null;
        const id = randomUUID();
        return tx.lifecycleEmailDelivery.create({ data: { id, userId, recipient, campaign: test ? 'TEST' : candidate.campaign, dedupeKey: key, payload: JSON.stringify(candidate), status: 'SENDING', messageId: '<' + id + '@lifecycle.emiguild.in>', dispatchedAt: now, createdAt: now } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') continue;
      throw error;
    }
  }
  return null;
}
export async function recoverInterrupted(now: Date) {
  // A process may have died after Gmail accepted DATA. Never automatically resend.
  return prisma.lifecycleEmailDelivery.updateMany({ where: { status: 'SENDING', dispatchedAt: { lte: new Date(now.getTime() - LEASE_MS) } }, data: { status: 'UNKNOWN', errorCode: 'WORKER_INTERRUPTED', finishedAt: now } });
}
async function pruneOldDeliveries(now: Date) {
  // Recent rows are a compact safety ledger for frequency caps and test limits.
  // Anything older than that window is no longer needed and is removed daily.
  return prisma.lifecycleEmailDelivery.deleteMany({ where: { dispatchedAt: { lt: new Date(now.getTime() - DELIVERY_RETENTION_MS) } } });
}
async function deliver(row: NonNullable<Awaited<ReturnType<typeof createSend>>>, candidate: MessageCandidate, options: DeliveryOptions) {
  const config = emailConfiguration();
  const token = signUnsubscribe({ userId: row.userId, email: row.recipient }, options.secret ?? lifecycleUnsubscribeSecret());
  const message = renderLifecycleEmail(candidate, options.siteUrl ?? config.siteUrl, token);
  let result;
  try { result = await (options.transport ?? gmailLifecycleTransport)({ ...message, to: row.recipient, messageId: row.messageId }); }
  catch { result = { status: 'UNKNOWN' as const, code: 'TRANSPORT_OUTCOME_UNKNOWN' }; }
  await prisma.lifecycleEmailDelivery.updateMany({ where: { id: row.id, status: 'SENDING' }, data: { status: result.status, errorCode: result.code ?? null, finishedAt: options.now ?? new Date() } });
  return result.status;
}
export async function sendPlayerEmail(userId: string, options: DeliveryOptions = {}) {
  const now = options.now ?? new Date();
  if (!emailConfiguration().enabled && !options.testMode) return 'DISABLED';
  await prisma.lifecycleEmailState.upsert({ where: { userId }, create: { userId }, update: {} });
  const leaseToken = randomUUID();
  const lease = await prisma.lifecycleEmailState.updateMany({ where: { userId, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { leaseToken, leaseUntil: new Date(now.getTime() + LEASE_MS) } });
  if (!lease.count) return 'BUSY';
  try {
    const evaluation = await loadEmailEvaluation(userId, now, { transportAvailable: true });
    if (!evaluation) return 'SUPPRESSED';
    const { input, preview } = evaluation;
    if (input.settings.comebackEmail && now.getTime() - Date.parse(input.createdAt) >= 3 * DAY && (!input.nextComebackCheckAt || Date.parse(input.nextComebackCheckAt) <= now.getTime())) {
      await prisma.lifecycleEmailState.update({ where: { userId }, data: { lastComebackEvaluatedAt: now, nextComebackCheckAt: new Date(now.getTime() + 3 * DAY) } });
    }
    if (!preview.selected) return 'SUPPRESSED';
    // Refresh the account before SMTP; actual gameplay, switches and visits can change during evaluation.
    const fresh = await loadEmailEvaluation(userId, options.now ?? new Date(), { ignoreSchedule: true, transportAvailable: true });
    const campaign = preview.selected;
    const channel = campaign === 'COMEBACK' ? fresh?.preview.comeback : fresh?.preview.digest;
    if (!fresh || !channel?.eligible || !channel.candidate) return 'SUPPRESSED';
    const sendNow = options.now ?? new Date();
    const key = userId + ':' + campaign + ':' + (campaign === 'DIGEST' ? digestPeriod(sendNow).toISOString() : now.toISOString());
    const row = await createSend(userId, fresh.user.email, channel.candidate, key, sendNow);
    if (!row) return 'SUPPRESSED';
    return deliver(row, channel.candidate, options);
  } finally {
    await prisma.lifecycleEmailState.updateMany({ where: { userId, leaseToken }, data: { leaseToken: null, leaseUntil: null } });
  }
}
export async function sendAdminTest(userId: string, options: DeliveryOptions = {}) {
  if (!emailConfiguration().enabled && !options.testMode) return { status: 'DISABLED' };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
  if (user?.role !== 'ADMIN') return { status: 'FORBIDDEN' };
  const now = options.now ?? new Date();
  const candidate: MessageCandidate = { campaign: 'DIGEST', subject: '[TEST] Your Vault has something for you', text: 'Your test email is ready.\n\nNo player account details or weekly email limits were used.', href: '/vault', sourceRefs: [], validUntil: new Date(now.getTime() + DAY).toISOString() };
  const row = await createSend(userId, user.email, candidate, 'TEST:' + randomUUID(), now, true);
  if (!row) return { status: 'LIMIT_REACHED' };
  return { status: await deliver(row, candidate, options), recipient: user.email };
}
export async function runLifecycleEmails(options: DeliveryOptions = {}) {
  const now = options.now ?? new Date();
  if (!emailConfiguration().enabled && !options.testMode) return { disabled: true, evaluated: 0, sent: 0 };
  const settings = await getMessagingSettings();
  if (!settings.emailDigest && !settings.comebackEmail) return { disabled: true, evaluated: 0, sent: 0 };
  const leaseToken = randomUUID();
  await prisma.setting.upsert({ where: { key: CRON_LOCK_KEY }, create: { key: CRON_LOCK_KEY, value: '' }, update: {} });
  const lock = await prisma.setting.updateMany({ where: { key: CRON_LOCK_KEY, OR: [{ value: '' }, { updatedAt: { lte: new Date(now.getTime() - LEASE_MS) } }] }, data: { value: leaseToken, updatedAt: now } });
  if (!lock.count) return { busy: true, evaluated: 0, sent: 0 };
  let evaluated = 0, sent = 0;
  const deadline = Date.now() + 180_000;
  try {
    await recoverInterrupted(now);
    await pruneOldDeliveries(now);
    const cursor = await prisma.setting.findUnique({ where: { key: CRON_CURSOR_KEY } });
    const users = await prisma.user.findMany({ where: { role: 'USER', ...(cursor?.value ? { id: { gt: cursor.value } } : {}) }, orderBy: { id: 'asc' }, select: { id: true }, take: 200 });
    for (const user of users) {
      if (Date.now() >= deadline || await prisma.lifecycleEmailDelivery.count({ where: { dispatchedAt: { gte: dayStart(now), lt: new Date(dayStart(now).getTime() + DAY) } } }) >= 50) break;
      try {
        const result = await sendPlayerEmail(user.id, options);
        if (['ACCEPTED', 'UNKNOWN'].includes(result)) sent++;
      } catch { /* One unavailable account must not stop the rest of the batch. */ }
      evaluated++;
      await prisma.setting.upsert({ where: { key: CRON_CURSOR_KEY }, create: { key: CRON_CURSOR_KEY, value: user.id }, update: { value: user.id } });
    }
    if (evaluated === users.length && users.length < 200) await prisma.setting.upsert({ where: { key: CRON_CURSOR_KEY }, create: { key: CRON_CURSOR_KEY, value: '' }, update: { value: '' } });
    return { evaluated, sent };
  } finally {
    await prisma.setting.updateMany({ where: { key: CRON_LOCK_KEY, value: leaseToken }, data: { value: '' } });
  }
}
