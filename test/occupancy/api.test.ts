import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { NextRequest } from "next/server";

test("admin API, bounded queries, status transitions, and dashboard month/week boundaries", async () => {
  require("../../auth");
  const authModule = require.cache[require.resolve("../../auth")]!;
  const originalAuth = authModule.exports;
  let role: string | null = "ADMIN";
  authModule.exports = { auth: async () => (role ? { user: { role } } : null) };
  let status = "CHECKED_IN";
  const bookingQuery = mock.fn(
    async (args: {
      where: { date: { gte: string; lte: string }; status?: string };
    }) => {
      assert.equal(args.where.status, "CHECKED_IN");
      return status === "CHECKED_IN" &&
        args.where.date.gte <= "2026-10-01" &&
        args.where.date.lte >= "2026-10-01"
        ? [
            {
              date: "2026-10-01",
              stationId: "a",
              status,
              startTime: "16:00",
              endTime: "18:00",
            },
          ]
        : [];
    },
  );
  const settingQuery = mock.fn(async () => ({ value: "2" }));
  require("../../lib/prisma");
  const prismaModule = require.cache[require.resolve("../../lib/prisma")]!;
  const originalPrisma = prismaModule.exports;
  prismaModule.exports = {
    prisma: {
      booking: { findMany: bookingQuery },
      setting: { findUnique: settingQuery },
    },
  };
  const {
    getAdminOccupancy,
    getDashboardOccupancy,
  } = require("../../lib/admin-occupancy");
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-30T20:00:00Z") });
  try {
    const { GET } = require("../../app/api/admin/occupancy/route");
    const request = (query: string) =>
      new NextRequest("http://localhost/api/admin/occupancy?" + query);
    for (role of [null, "USER"])
      assert.equal(
        (await GET(request("from=2026-10-01&to=2026-10-01"))).status,
        403,
      );
    assert.equal(bookingQuery.mock.callCount(), 0);
    role = "ADMIN";
    for (const query of [
      "",
      "from=2026-02-30&to=2026-03-01",
      "from=2026-10-02&to=2026-10-01",
      "from=2026-10-01&to=2026-10-02",
      "from=2024-01-01&to=2026-10-01",
      "period=overall&from=2026-10-01",
      "period=overall&to=2026-10-01",
      "period=month",
      "period=",
    ])
      assert.equal((await GET(request(query))).status, 400);
    assert.equal(bookingQuery.mock.callCount(), 0);
    const response = await GET(request("from=2026-10-01&to=2026-10-01"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).summary.percentage, 14.3);
    assert.equal(bookingQuery.mock.callCount(), 1);
    assert.equal(settingQuery.mock.callCount(), 1);
    const cards = await getDashboardOccupancy();
    assert.equal(cards[0].occupiedMinutes, 120, "Today follows IST");
    assert.equal(
      cards[1].availableMinutes,
      4 * 7 * 120,
      "Week includes September dates",
    );
    assert.equal(cards[2].availableMinutes, 7 * 120, "Month starts October 1");
    assert.equal(cards[4].availableMinutes, 0);
    status = "COMPLETED";
    assert.equal(
      (await getAdminOccupancy("2026-10-01", "2026-10-01")).summary
        .occupiedMinutes,
      0,
    );
    bookingQuery.mock.mockImplementation(async () => {
      throw new Error("Database unavailable");
    });
    const failure = await GET(request("from=2026-10-01&to=2026-10-01"));
    assert.equal(failure.status, 500);
    assert.match((await failure.json()).error, /try again/i);
  } finally {
    authModule.exports = originalAuth;
    prismaModule.exports = originalPrisma;
    mock.restoreAll();
    mock.timers.reset();
  }
});
