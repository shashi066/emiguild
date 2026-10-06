import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { addIndiaCalendarDays, getIndiaClock } from '@/lib/public-booking-time';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import { guidedWindow } from './flow-state';
import { DEFAULT_AI_DAILY_LIMIT, getAssistantConfigSummary } from './config';

export const ASSISTANT_VISITOR_COOKIE = 'emiguild_assistant_visitor';
export const ASSISTANT_AI_DAILY_LIMIT = DEFAULT_AI_DAILY_LIMIT;

export async function startGuidedRequest(actorKey: string) {
  const date = getIndiaClock().date;
  const limit = positiveInt(process.env.ASSISTANT_GUIDED_PER_MINUTE_LIMIT, 60);
  const result = await runSerializableTransaction(async (tx) => {
    const where = { date_actorKey: { date, actorKey } };
    const row = await tx.assistantUsageDaily.upsert({ where, create: { date, actorKey }, update: {} });
    const { allowed, ...window } = guidedWindow(row, Date.now(), limit);
    if (allowed) await tx.assistantUsageDaily.update({ where, data: { ...window, guidedRequestCount: { increment: 1 } } });
    return allowed;
  });
  return result;
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function assistantActor(userId: string | null, visitorId: string) {
  if (userId) return { actorKey: `user:${userId}`, limit: ASSISTANT_AI_DAILY_LIMIT };
  const digest = crypto.createHash('sha256').update(visitorId).digest('hex');
  return { actorKey: `anon:${digest}`, limit: 0 };
}

export function assistantAllowance(date: string, requestCount: number, limit = DEFAULT_AI_DAILY_LIMIT) {
  return {
    date, limit,
    remaining: Math.max(0, limit - requestCount),
    resetsAt: new Date(`${addIndiaCalendarDays(date, 1)}T00:00:00+05:30`).toISOString(),
  };
}

export async function getAssistantUsage(actorKey: string, now = new Date(), limit?: number) {
  limit ??= (await getAssistantConfigSummary()).dailyLimit;
  const date = getIndiaClock(now).date;
  const row = await prisma.assistantUsageDaily.findUnique({
    where: { date_actorKey: { date, actorKey } }, select: { requestCount: true },
  });
  return assistantAllowance(date, row?.requestCount ?? 0, limit);
}

export async function startAssistantRequest(actorKey: string, limit: number, now = new Date()) {
  if (!actorKey.startsWith('user:')) throw new Error('AI chat requires sign-in.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid AI allowance.');
  const date = getIndiaClock(now).date;
  const { reserved, usage } = await runSerializableTransaction(async (tx) => {
    await tx.assistantUsageDaily.upsert({
      where: { date_actorKey: { date, actorKey } },
      create: { date, actorKey }, update: {},
    });
    // Conditional write plus transaction prevents overspend and rolls back on DB failure.
    const reserved = await tx.assistantUsageDaily.updateMany({
      where: { date, actorKey, requestCount: { lt: limit } },
      data: { requestCount: { increment: 1 } },
    });
    const usage = await tx.assistantUsageDaily.findUniqueOrThrow({
      where: { date_actorKey: { date, actorKey } }, select: { requestCount: true },
    });
    return { reserved, usage };
  });
  return { allowed: reserved.count === 1, ...assistantAllowance(date, usage.requestCount, limit) };
}

// Only used when a request was cancelled before provider dispatch.
export async function releaseAssistantReservation(actorKey: string, date: string) {
  return prisma.assistantUsageDaily.updateMany({
    where: { date, actorKey, requestCount: { gt: 0 } }, data: { requestCount: { decrement: 1 } },
  });
}

export async function recordAssistantUsage(actorKey: string, counters: {
  inputTokens?: number;
  outputTokens?: number;
  toolCallCount?: number;
  preparedActions?: number;
  completedActions?: number;
  errorCount?: number;
}, date = getIndiaClock().date) {
  const data = {
    inputTokens: { increment: Math.max(0, counters.inputTokens ?? 0) },
    outputTokens: { increment: Math.max(0, counters.outputTokens ?? 0) },
    toolCallCount: { increment: Math.max(0, counters.toolCallCount ?? 0) },
    preparedActions: { increment: Math.max(0, counters.preparedActions ?? 0) },
    completedActions: { increment: Math.max(0, counters.completedActions ?? 0) },
    errorCount: { increment: Math.max(0, counters.errorCount ?? 0) },
  };
  await prisma.assistantUsageDaily.upsert({
    where: { date_actorKey: { date, actorKey } },
    create: {
      date,
      actorKey,
      inputTokens: counters.inputTokens ?? 0,
      outputTokens: counters.outputTokens ?? 0,
      toolCallCount: counters.toolCallCount ?? 0,
      preparedActions: counters.preparedActions ?? 0,
      completedActions: counters.completedActions ?? 0,
      errorCount: counters.errorCount ?? 0,
    },
    update: data,
  });
}
