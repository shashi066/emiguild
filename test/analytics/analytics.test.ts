import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma } from '@prisma/client';
import {
  buildAnalyticsVisitorsQuery,
  getAdminAnalytics,
  normalizeAnalyticsCount,
  type AnalyticsDataStore,
} from '../../lib/analytics/data';
import {
  getAnalyticsDateRanges,
  getIndiaAnalyticsDay,
  toAnalyticsDateKey,
} from '../../lib/analytics/date';
import {
  ANONYMOUS_ANALYTICS_USER_KEY,
  incrementHomepageVisit,
  processHomepageAnalyticsRequest,
} from '../../lib/analytics/interaction';
import { isValidHomepageAnalyticsRequest } from '../../lib/analytics/request';

function iso(value: Date): string {
  return value.toISOString();
}

function makeHomepageRequest(options: {
  body?: string;
  headers?: Record<string, string | null>;
  method?: string;
  url?: string;
} = {}): Request {
  const headers = new Headers({
    origin: 'https://emiguild.test',
    referer: 'https://emiguild.test/?utm_source=instagram',
    'sec-fetch-site': 'same-origin',
  });

  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }

  const method = options.method ?? 'POST';
  return new Request(
    options.url ?? 'https://emiguild.test/api/analytics/interaction',
    {
      method,
      headers,
      ...(method === 'GET' || method === 'HEAD'
        ? {}
        : { body: options.body ?? 'homepage' }),
    },
  );
}

test('uses the Asia/Kolkata day boundary independent of the host timezone', () => {
  const previousTimeZone = process.env.TZ;

  try {
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(
      iso(getIndiaAnalyticsDay(new Date('2026-08-05T18:29:59.999Z'))),
      '2026-08-05T00:00:00.000Z',
    );
    assert.equal(
      iso(getIndiaAnalyticsDay(new Date('2026-08-05T18:30:00.000Z'))),
      '2026-08-06T00:00:00.000Z',
    );

    process.env.TZ = 'Pacific/Kiritimati';
    assert.equal(
      iso(getIndiaAnalyticsDay(new Date('2026-08-05T18:30:00.000Z'))),
      '2026-08-06T00:00:00.000Z',
    );
  } finally {
    if (previousTimeZone == null) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test('builds inclusive rolling windows across month and year boundaries', () => {
  const ranges = getAnalyticsDateRanges(new Date('2026-01-01T12:00:00.000Z'));

  assert.deepEqual(
    Object.fromEntries(Object.entries(ranges).map(([key, value]) => [key, iso(value)])),
    {
      today: '2026-01-01T00:00:00.000Z',
      tomorrow: '2026-01-02T00:00:00.000Z',
      yesterday: '2025-12-31T00:00:00.000Z',
      last7DaysStart: '2025-12-26T00:00:00.000Z',
      last30DaysStart: '2025-12-03T00:00:00.000Z',
      currentMonthStart: '2026-01-01T00:00:00.000Z',
      previousMonthStart: '2025-12-01T00:00:00.000Z',
      currentYearStart: '2026-01-01T00:00:00.000Z',
      retentionStart: '2025-01-01T00:00:00.000Z',
    },
  );
});

test('clamps the one-year retention anniversary on leap day', () => {
  const leapDay = getAnalyticsDateRanges(new Date('2024-02-29T12:00:00.000Z'));
  const afterLeapYear = getAnalyticsDateRanges(new Date('2025-02-28T12:00:00.000Z'));

  assert.equal(iso(leapDay.retentionStart), '2023-02-28T00:00:00.000Z');
  assert.equal(iso(afterLeapYear.retentionStart), '2024-02-28T00:00:00.000Z');
  assert.equal(
    (leapDay.tomorrow.getTime() - leapDay.retentionStart.getTime()) / 86_400_000,
    367,
  );
  assert.equal(
    (afterLeapYear.tomorrow.getTime() - afterLeapYear.retentionStart.getTime()) / 86_400_000,
    367,
  );

  const ordinaryYear = getAnalyticsDateRanges(new Date('2026-08-05T12:00:00.000Z'));
  assert.equal(
    (ordinaryYear.tomorrow.getTime() - ordinaryYear.retentionStart.getTime()) / 86_400_000,
    366,
  );
});

test('accepts only same-origin root-page marker requests', async () => {
  assert.equal(await isValidHomepageAnalyticsRequest(makeHomepageRequest()), true);
  assert.equal(await isValidHomepageAnalyticsRequest(makeHomepageRequest({
    headers: { 'sec-fetch-site': null },
  })), true);

  const invalidRequests = [
    makeHomepageRequest({ body: 'other' }),
    makeHomepageRequest({ body: 'homepage:user-1' }),
    makeHomepageRequest({ body: '{"marker":"homepage","userId":"user-1"}' }),
    makeHomepageRequest({ method: 'GET' }),
    makeHomepageRequest({ headers: { origin: null } }),
    makeHomepageRequest({ headers: { origin: 'https://attacker.test' } }),
    makeHomepageRequest({ headers: { origin: 'https://emiguild.test/' } }),
    makeHomepageRequest({ headers: { referer: 'https://emiguild.test/games' } }),
    makeHomepageRequest({ headers: { referer: 'https://attacker.test/' } }),
    makeHomepageRequest({ headers: { referer: null } }),
    makeHomepageRequest({ headers: { 'sec-fetch-site': 'cross-site' } }),
    makeHomepageRequest({ headers: { 'sec-fetch-site': 'same-site' } }),
    makeHomepageRequest({ headers: { 'content-length': '999' } }),
    makeHomepageRequest({ url: 'https://other-host.test/api/analytics/interaction' }),
  ];

  for (const request of invalidRequests) {
    assert.equal(await isValidHomepageAnalyticsRequest(request), false);
  }
});

test('resolves server identity only after request provenance is accepted', async () => {
  let authenticationCalls = 0;
  const recordedUserIds: Array<string | null | undefined> = [];
  const resolveUserId = async () => {
    authenticationCalls += 1;
    return 'user-42';
  };
  const record = async (userId: string | null | undefined) => {
    recordedUserIds.push(userId);
  };

  assert.equal(
    await processHomepageAnalyticsRequest(
      makeHomepageRequest({ headers: { referer: '/not-an-absolute-url' } }),
      resolveUserId,
      record,
    ),
    false,
  );
  assert.equal(authenticationCalls, 0);
  assert.deepEqual(recordedUserIds, []);

  assert.equal(
    await processHomepageAnalyticsRequest(makeHomepageRequest(), resolveUserId, record),
    true,
  );
  assert.equal(authenticationCalls, 1);
  assert.deepEqual(recordedUserIds, ['user-42']);
});

test('uses the exact atomic composite upsert for users and anonymous visits', async () => {
  const calls: unknown[] = [];
  const store = {
    websiteAnalytics: {
      async upsert(args: unknown) {
        calls.push(args);
      },
    },
  };
  const now = new Date('2026-08-05T18:30:00.000Z');

  await incrementHomepageVisit('user-1', now, store);
  await incrementHomepageVisit(null, now, store);

  const date = new Date('2026-08-06T00:00:00.000Z');
  assert.deepEqual(calls, [
    {
      where: { date_userKey: { date, userKey: 'user-1' } },
      create: { date, userKey: 'user-1', visits: 1 },
      update: { visits: { increment: 1 } },
    },
    {
      where: {
        date_userKey: { date, userKey: ANONYMOUS_ANALYTICS_USER_KEY },
      },
      create: {
        date,
        userKey: ANONYMOUS_ANALYTICS_USER_KEY,
        visits: 1,
      },
      update: { visits: { increment: 1 } },
    },
  ]);
});

test('parameterizes one grouped visitor query with user metadata and all ranges', () => {
  const ranges = getAnalyticsDateRanges(new Date('2026-08-05T12:00:00.000Z'));
  const query = buildAnalyticsVisitorsQuery(ranges);
  const sql = query.strings.join('?');

  assert.match(sql, /LEFT JOIN "users"/);
  assert.match(sql, /GROUP BY\s+analytics\."userKey"/);
  assert.match(sql, /AS "today"/);
  assert.match(sql, /AS "rollingYear"/);
  assert.equal(query.values.length, 18);
  assert.deepEqual(
    query.values.map((value) => iso(value as Date)),
    [
      ranges.today, ranges.tomorrow,
      ranges.yesterday, ranges.today,
      ranges.last7DaysStart, ranges.tomorrow,
      ranges.last30DaysStart, ranges.tomorrow,
      ranges.currentMonthStart, ranges.tomorrow,
      ranges.previousMonthStart, ranges.currentMonthStart,
      ranges.currentYearStart, ranges.tomorrow,
      ranges.retentionStart, ranges.tomorrow,
      ranges.retentionStart, ranges.tomorrow,
    ].map(iso),
  );
});

test('maps visitor types, sorts visits, and derives every overall summary field', async () => {
  let deleteBefore: Date | undefined;
  let queryCalls = 0;
  const rows = [
    {
      userKey: 'user-z', joinedUserId: 'user-z', userName: 'Alice',
      userEmail: 'z@example.test', userRole: 'USER',
      today: BigInt(0), yesterday: BigInt(1), last7Days: BigInt(2), last30Days: BigInt(7),
      currentMonth: BigInt(2), previousMonth: BigInt(5), currentYear: BigInt(7), rollingYear: BigInt(7),
    },
    {
      userKey: ANONYMOUS_ANALYTICS_USER_KEY, joinedUserId: null, userName: null,
      userEmail: null, userRole: null,
      today: BigInt(4), yesterday: '2', last7Days: BigInt(10), last30Days: BigInt(12),
      currentMonth: BigInt(8), previousMonth: BigInt(4), currentYear: BigInt(12), rollingYear: BigInt(12),
    },
    {
      userKey: 'deleted-1', joinedUserId: null, userName: null,
      userEmail: null, userRole: null,
      today: BigInt(1), yesterday: BigInt(1), last7Days: BigInt(3), last30Days: BigInt(9),
      currentMonth: BigInt(2), previousMonth: BigInt(7), currentYear: BigInt(9), rollingYear: BigInt(9),
    },
    {
      userKey: 'user-a', joinedUserId: 'user-a', userName: 'Alice',
      userEmail: 'a@example.test', userRole: 'ADMIN',
      today: BigInt(2), yesterday: null, last7Days: BigInt(3), last30Days: BigInt(7),
      currentMonth: BigInt(3), previousMonth: BigInt(4), currentYear: BigInt(7), rollingYear: BigInt(7),
    },
  ];
  const store: AnalyticsDataStore = {
    websiteAnalytics: {
      async deleteMany(args) {
        deleteBefore = args.where.date.lt;
        return { count: 0 };
      },
    },
    async $queryRaw<T>(_query: Prisma.Sql): Promise<T> {
      queryCalls += 1;
      return rows as T;
    },
  };

  const analytics = await getAdminAnalytics(
    new Date('2026-08-05T12:00:00.000Z'),
    store,
  );

  assert.equal(iso(deleteBefore!), '2025-08-05T00:00:00.000Z');
  assert.equal(queryCalls, 1);
  assert.deepEqual(analytics.summary, {
    today: 7,
    yesterday: 4,
    last7Days: 18,
    last30Days: 35,
    currentMonth: 15,
    previousMonth: 20,
    currentYear: 35,
    rollingYear: 35,
  });
  assert.deepEqual(
    analytics.visitors.map(({ type, userId, name }) => ({ type, userId, name })),
    [
      { type: 'ANONYMOUS', userId: null, name: 'Anonymous' },
      { type: 'DELETED', userId: 'deleted-1', name: 'Deleted account' },
      { type: 'USER', userId: 'user-a', name: 'Alice' },
      { type: 'USER', userId: 'user-z', name: 'Alice' },
    ],
  );
  assert.equal(analytics.visitors[2].email, 'a@example.test');
  assert.equal(analytics.visitors[2].role, 'ADMIN');
  assert.equal('sortKey' in analytics.visitors[2], false);
});

test('retention deletion removes older rows but preserves the exact anniversary', async () => {
  const dates = [
    new Date('2025-08-04T00:00:00.000Z'),
    new Date('2025-08-05T00:00:00.000Z'),
    new Date('2025-08-06T00:00:00.000Z'),
  ];
  let retainedDates = [...dates];
  const store: AnalyticsDataStore = {
    websiteAnalytics: {
      async deleteMany(args) {
        retainedDates = retainedDates.filter(
          (date) => date.getTime() >= args.where.date.lt.getTime(),
        );
        return { count: dates.length - retainedDates.length };
      },
    },
    async $queryRaw<T>(): Promise<T> {
      return [] as T;
    },
  };

  const result = await getAdminAnalytics(
    new Date('2026-08-05T12:00:00.000Z'),
    store,
  );

  assert.deepEqual(retainedDates.map(toAnalyticsDateKey), ['2025-08-05', '2025-08-06']);
  assert.deepEqual(result, {
    summary: {
      today: 0, yesterday: 0, last7Days: 0, last30Days: 0,
      currentMonth: 0, previousMonth: 0, currentYear: 0, rollingYear: 0,
    },
    visitors: [],
  });
});

test('normalizes database aggregate representations without NaN or negatives', () => {
  assert.equal(normalizeAnalyticsCount(BigInt(12)), 12);
  assert.equal(normalizeAnalyticsCount('7'), 7);
  assert.equal(normalizeAnalyticsCount(null), 0);
  assert.equal(normalizeAnalyticsCount(-1), 0);
  assert.equal(normalizeAnalyticsCount('not-a-number'), 0);
});
