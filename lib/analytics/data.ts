import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  getAnalyticsDateRanges,
  type AnalyticsDateRanges,
} from './date';
import { ANONYMOUS_ANALYTICS_USER_KEY } from './interaction';

export interface AnalyticsSummary {
  today: number;
  yesterday: number;
  last7Days: number;
  last30Days: number;
  currentMonth: number;
  previousMonth: number;
  currentYear: number;
  rollingYear: number;
}

export interface AnalyticsVisitor {
  type: 'USER' | 'ANONYMOUS' | 'DELETED';
  userId: string | null;
  name: string;
  email: string | null;
  role: string | null;
  visits: AnalyticsSummary;
}

export interface AdminAnalyticsData {
  summary: AnalyticsSummary;
  visitors: AnalyticsVisitor[];
}

type SummaryDatabaseValue = bigint | number | string | null;

interface VisitorQueryRow {
  userKey: string;
  joinedUserId: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  today: SummaryDatabaseValue;
  yesterday: SummaryDatabaseValue;
  last7Days: SummaryDatabaseValue;
  last30Days: SummaryDatabaseValue;
  currentMonth: SummaryDatabaseValue;
  previousMonth: SummaryDatabaseValue;
  currentYear: SummaryDatabaseValue;
  rollingYear: SummaryDatabaseValue;
}

export interface AnalyticsDataStore {
  websiteAnalytics: {
    deleteMany(args: { where: { date: { lt: Date } } }): Promise<unknown>;
  };
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

const SUMMARY_KEYS = [
  'today',
  'yesterday',
  'last7Days',
  'last30Days',
  'currentMonth',
  'previousMonth',
  'currentYear',
  'rollingYear',
] as const satisfies readonly (keyof AnalyticsSummary)[];

export function buildAnalyticsVisitorsQuery(
  ranges: AnalyticsDateRanges,
): Prisma.Sql {
  return Prisma.sql`
    SELECT
      analytics."userKey" AS "userKey",
      users."id" AS "joinedUserId",
      users."name" AS "userName",
      users."email" AS "userEmail",
      users."role" AS "userRole",
      COALESCE(SUM(CASE WHEN analytics."date" >= ${ranges.today} AND analytics."date" < ${ranges.tomorrow} THEN analytics."visits" ELSE 0 END), 0) AS "today",
      COALESCE(SUM(CASE WHEN analytics."date" >= ${ranges.yesterday} AND analytics."date" < ${ranges.today} THEN analytics."visits" ELSE 0 END), 0) AS "yesterday",
      COALESCE(SUM(CASE WHEN analytics."date" >= ${ranges.last7DaysStart} AND analytics."date" < ${ranges.tomorrow} THEN analytics."visits" ELSE 0 END), 0) AS "last7Days",
      COALESCE(SUM(CASE WHEN analytics."date" >= ${ranges.last30DaysStart} AND analytics."date" < ${ranges.tomorrow} THEN analytics."visits" ELSE 0 END), 0) AS "last30Days",
      COALESCE(SUM(CASE WHEN analytics."date" >= ${ranges.currentMonthStart} AND analytics."date" < ${ranges.tomorrow} THEN analytics."visits" ELSE 0 END), 0) AS "currentMonth",
      COALESCE(SUM(CASE WHEN analytics."date" >= ${ranges.previousMonthStart} AND analytics."date" < ${ranges.currentMonthStart} THEN analytics."visits" ELSE 0 END), 0) AS "previousMonth",
      COALESCE(SUM(CASE WHEN analytics."date" >= ${ranges.currentYearStart} AND analytics."date" < ${ranges.tomorrow} THEN analytics."visits" ELSE 0 END), 0) AS "currentYear",
      COALESCE(SUM(CASE WHEN analytics."date" >= ${ranges.retentionStart} AND analytics."date" < ${ranges.tomorrow} THEN analytics."visits" ELSE 0 END), 0) AS "rollingYear"
    FROM "website_analytics" AS analytics
    LEFT JOIN "users" AS users ON users."id" = analytics."userKey"
    WHERE analytics."date" >= ${ranges.retentionStart}
      AND analytics."date" < ${ranges.tomorrow}
    GROUP BY
      analytics."userKey",
      users."id",
      users."name",
      users."email",
      users."role"
  `;
}

export function normalizeAnalyticsCount(
  value: SummaryDatabaseValue | undefined,
): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

function normalizeVisits(row: VisitorQueryRow): AnalyticsSummary {
  return {
    today: normalizeAnalyticsCount(row.today),
    yesterday: normalizeAnalyticsCount(row.yesterday),
    last7Days: normalizeAnalyticsCount(row.last7Days),
    last30Days: normalizeAnalyticsCount(row.last30Days),
    currentMonth: normalizeAnalyticsCount(row.currentMonth),
    previousMonth: normalizeAnalyticsCount(row.previousMonth),
    currentYear: normalizeAnalyticsCount(row.currentYear),
    rollingYear: normalizeAnalyticsCount(row.rollingYear),
  };
}

function emptySummary(): AnalyticsSummary {
  return {
    today: 0,
    yesterday: 0,
    last7Days: 0,
    last30Days: 0,
    currentMonth: 0,
    previousMonth: 0,
    currentYear: 0,
    rollingYear: 0,
  };
}

function toVisitor(row: VisitorQueryRow): AnalyticsVisitor & { sortKey: string } {
  const visits = normalizeVisits(row);

  if (row.userKey === ANONYMOUS_ANALYTICS_USER_KEY) {
    return {
      type: 'ANONYMOUS',
      userId: null,
      name: 'Anonymous',
      email: null,
      role: null,
      visits,
      sortKey: row.userKey,
    };
  }

  if (!row.joinedUserId) {
    return {
      type: 'DELETED',
      userId: row.userKey,
      name: 'Deleted account',
      email: null,
      role: null,
      visits,
      sortKey: row.userKey,
    };
  }

  return {
    type: 'USER',
    userId: row.joinedUserId,
    name: row.userName ?? 'Unknown user',
    email: row.userEmail,
    role: row.userRole,
    visits,
    sortKey: row.userKey,
  };
}

export async function getAdminAnalytics(
  now: Date = new Date(),
  store: AnalyticsDataStore = prisma as unknown as AnalyticsDataStore,
): Promise<AdminAnalyticsData> {
  const ranges = getAnalyticsDateRanges(now);

  await store.websiteAnalytics.deleteMany({
    where: { date: { lt: ranges.retentionStart } },
  });

  const rows = await store.$queryRaw<VisitorQueryRow[]>(
    buildAnalyticsVisitorsQuery(ranges),
  );
  const visitorsWithSortKeys = rows.map(toVisitor);

  visitorsWithSortKeys.sort((left, right) => (
    right.visits.rollingYear - left.visits.rollingYear
    || left.name.localeCompare(right.name, 'en')
    || left.sortKey.localeCompare(right.sortKey, 'en')
  ));

  const summary = visitorsWithSortKeys.reduce((totals, visitor) => {
    for (const key of SUMMARY_KEYS) {
      totals[key] += visitor.visits[key];
    }
    return totals;
  }, emptySummary());

  const visitors = visitorsWithSortKeys.map(({ sortKey: _sortKey, ...visitor }) => visitor);

  return { summary, visitors };
}
