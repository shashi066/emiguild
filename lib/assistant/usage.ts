import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { addIndiaCalendarDays, getIndiaClock } from '@/lib/public-booking-time';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import { guidedWindow } from './flow-state';

export const ASSISTANT_VISITOR_COOKIE = 'emiguild_assistant_visitor';

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
  const retentionDate = addIndiaCalendarDays(date, -90);
  if (retentionDate) await prisma.assistantUsageDaily.deleteMany({ where: { date: { lt: retentionDate } } });
  return result;
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function assistantActor(userId: string | null, visitorId: string) {
  if (userId) return { actorKey: `user:${userId}`, limit: positiveInt(process.env.ASSISTANT_USER_DAILY_LIMIT, 100) };
  const digest = crypto.createHash('sha256').update(visitorId).digest('hex');
  return { actorKey: `anon:${digest}`, limit: positiveInt(process.env.ASSISTANT_ANONYMOUS_DAILY_LIMIT, 30) };
}

export async function startAssistantRequest(actorKey: string, limit: number) {
  const date = getIndiaClock().date;
  const usage = await prisma.assistantUsageDaily.upsert({
    where: { date_actorKey: { date, actorKey } },
    create: { date, actorKey, requestCount: 1 },
    update: { requestCount: { increment: 1 } },
  });
  const retentionDate = addIndiaCalendarDays(date, -90);
  if (retentionDate) {
    void prisma.assistantUsageDaily.deleteMany({ where: { date: { lt: retentionDate } } }).catch(() => undefined);
  }
  return { allowed: usage.requestCount <= limit, remaining: Math.max(0, limit - usage.requestCount) };
}

export async function recordAssistantUsage(actorKey: string, counters: {
  inputTokens?: number;
  outputTokens?: number;
  toolCallCount?: number;
  preparedActions?: number;
  completedActions?: number;
  errorCount?: number;
}) {
  const date = getIndiaClock().date;
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
