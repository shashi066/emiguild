import { prisma } from '@/lib/prisma';
import { getIndiaAnalyticsDay } from './date';
import { isValidHomepageAnalyticsRequest } from './request';

export const ANONYMOUS_ANALYTICS_USER_KEY = '__ANONYMOUS__';

interface HomepageVisitStore {
  websiteAnalytics: {
    upsert(args: {
      where: { date_userKey: { date: Date; userKey: string } };
      create: { date: Date; userKey: string; visits: number };
      update: { visits: { increment: number } };
    }): Promise<unknown>;
  };
}

export async function incrementHomepageVisit(
  userId: string | null | undefined,
  now: Date = new Date(),
  store: HomepageVisitStore = prisma as unknown as HomepageVisitStore,
): Promise<void> {
  const date = getIndiaAnalyticsDay(now);
  const userKey = userId || ANONYMOUS_ANALYTICS_USER_KEY;

  await store.websiteAnalytics.upsert({
    where: { date_userKey: { date, userKey } },
    create: { date, userKey, visits: 1 },
    update: { visits: { increment: 1 } },
  });
}

export async function processHomepageAnalyticsRequest(
  request: Request,
  resolveUserId: () => Promise<string | null | undefined>,
  increment: (
    userId: string | null | undefined,
  ) => Promise<void> = incrementHomepageVisit,
): Promise<boolean> {
  if (!await isValidHomepageAnalyticsRequest(request)) return false;

  const userId = await resolveUserId();
  await increment(userId);
  return true;
}
