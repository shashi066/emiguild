import { prisma } from '@/lib/prisma';
import { getVaultState } from './server';
import { getMessagingSettings } from './settings';
import { ActivityWindow, DAY, DeliveryHistory, EmailCampaign, EvaluationInput, evaluateLifecycle } from './rules';
import { emailConfiguration } from './email';

export async function loadEmailEvaluation(userId: string, now = new Date(), options: { ignoreSchedule?: boolean; transportAvailable?: boolean } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { lifecycleEmailState: true } });
  if (!user) return null;
  const start = new Date(now.getTime() - 3 * DAY);
  const [state, settings, rows, counts] = await Promise.all([
    getVaultState(user.id, now), getMessagingSettings(),
    prisma.lifecycleEmailDelivery.findMany({ where: { userId, campaign: { not: 'TEST' }, dispatchedAt: { gt: new Date(now.getTime() - 7 * DAY) } }, orderBy: { dispatchedAt: 'desc' } }),
    Promise.allSettled([
      prisma.userDailySpin.count({ where: { userId, createdAt: { gte: start, lt: now } } }),
      prisma.armoryDailyClaim.count({ where: { userId, createdAt: { gte: start, lt: now } } }),
      prisma.guess36Entry.count({ where: { userId, createdAt: { gte: start, lt: now } } }),
    ]),
  ]);
  const activity: ActivityWindow = { start: start.toISOString(), end: now.toISOString(),
    spin: counts[0].status === 'fulfilled' ? counts[0].value : 0, forge: counts[1].status === 'fulfilled' ? counts[1].value : 0, guess36: counts[2].status === 'fulfilled' ? counts[2].value : 0,
    reliable: counts.every((count) => count.status === 'fulfilled'),
    featuresEnabled: ['spin', 'artifacts', 'guess36'].every((id) => state.games.some((game) => game.id === id && !['disabled', 'error'].includes(game.status))),
  };
  const history: DeliveryHistory = rows.map((row) => ({ campaign: row.campaign as EmailCampaign, status: row.status, at: row.dispatchedAt.toISOString() }));
  const input: EvaluationInput = { state, settings, email: user.email, createdAt: user.createdAt.toISOString(), lastWebsiteVisitAt: user.lastWebsiteVisitAt?.toISOString() ?? null,
    unsubscribed: !!user.lifecycleEmailState?.unsubscribedAt,
    nextComebackCheckAt: user.lifecycleEmailState?.nextComebackCheckAt?.toISOString() ?? null,
    activity, now, history, transportAvailable: options.transportAvailable ?? emailConfiguration().enabled, ignoreSchedule: options.ignoreSchedule };
  return { user, input, preview: evaluateLifecycle(input) };
}
