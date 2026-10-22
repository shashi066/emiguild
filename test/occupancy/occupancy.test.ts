import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  calculateOccupancy,
  validateOccupancyRange,
  weekStart,
  type OccupancyBooking,
} from "../../lib/occupancy";
import { getTodayString } from "../../lib/utils";

function booking(overrides: Partial<OccupancyBooking> = {}): OccupancyBooking {
  return {
    date: "2026-10-22",
    stationId: "a",
    status: "CHECKED_IN",
    startTime: "16:00",
    endTime: "18:00",
    ...overrides,
  };
}
const report = (
  rows: OccupancyBooking[],
  from = "2026-10-22",
  to = from,
  capacity = 2,
) => calculateOccupancy(rows, capacity, from, to);
test("fixed weekday and weekend capacity and status eligibility", () => {
  assert.equal(report([booking()]).summary.percentage, 14.3);
  assert.equal(
    report([booking({ date: "2026-10-24" })], "2026-10-24").summary.percentage,
    10,
  );
  for (const status of ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"])
    assert.equal(report([booking({ status })]).summary.occupiedMinutes, 0);
  assert.equal(
    report([booking(), booking({ status: "CONFIRMED" })]).summary.bookingCount,
    1,
  );
});
test("clips to reporting hours, supports partial hours, and rejects malformed intervals", () => {
  const result = report([
    booking({ startTime: "15:30", endTime: "16:30" }),
    booking({ startTime: "22:45", endTime: "24:00" }),
    booking({ startTime: "bad" }),
    booking({ startTime: "18:00", endTime: "17:00" }),
  ]);
  assert.equal(result.summary.occupiedMinutes, 45);
  assert.equal(result.summary.bookingCount, 2);
  assert.equal(
    result.heatmap[3].cells.find((c) => c.hour === 16)?.occupiedMinutes,
    30,
  );
  assert.equal(
    result.heatmap[3].cells.find((c) => c.hour === 22)?.occupiedMinutes,
    15,
  );
});
test("merges station overlap and caps simultaneous screens, not total hours", () => {
  assert.equal(
    report([booking(), booking({ startTime: "17:00", endTime: "19:00" })])
      .summary.occupiedMinutes,
    180,
  );
  assert.equal(
    report([
      booking(),
      booking({ stationId: "b" }),
      booking({ stationId: "c" }),
      booking({ startTime: "18:00", endTime: "19:00" }),
    ]).summary.occupiedMinutes,
    300,
  );
  assert.equal(
    report([
      booking({ endTime: "23:00" }),
      booking({ stationId: "b", endTime: "23:00" }),
      booking({ stationId: "c", endTime: "23:00" }),
    ]).summary.percentage,
    100,
  );
});
test("weights aggregates by capacity and includes empty days", () => {
  const result = report(
    [booking({ date: "2026-10-23", endTime: "23:00" })],
    "2026-10-23",
    "2026-10-24",
  );
  assert.equal(result.summary.availableMinutes, 2040);
  assert.equal(result.summary.percentage, 20.6);
  assert.equal(result.daily[1].percentage, 0);
  assert.equal(result.weekdays.percentage, 50);
  assert.equal(result.weekends.percentage, 0);
  assert.equal(result.heatmap[4].cells[0].availableMinutes, 0);
  assert.equal(result.heatmap[5].cells[0].availableMinutes, 120);
});
test("heatmap combines matching weekdays with a weighted denominator", () => {
  const result = report([booking()], "2026-10-22", "2026-10-29");
  const cell = result.heatmap[3].cells.find((c) => c.hour === 16)!;
  assert.deepEqual(cell, {
    hour: 16,
    occupiedMinutes: 60,
    availableMinutes: 240,
    bookingCount: 1,
    dayCount: 2,
    percentage: 25,
  });
});
test("Monday weeks, calendar months, and partial periods across year boundary", () => {
  assert.equal(weekStart("2027-01-03"), "2026-12-28");
  const result = report([], "2026-12-30", "2027-01-05");
  assert.equal(result.daily.length, 7);
  assert.deepEqual(
    result.weekly.map((r) => [r.key, r.from, r.to]),
    [
      ["2026-12-28", "2026-12-30", "2027-01-03"],
      ["2027-01-04", "2027-01-04", "2027-01-05"],
    ],
  );
  assert.deepEqual(
    result.monthly.map((r) => r.key),
    ["2026-12", "2027-01"],
  );
});
test("validates impossible, future, reversed, missing and oversized date ranges", () => {
  for (const [from, to] of [
    ["", ""],
    ["2026-02-30", "2026-03-01"],
    ["2026-10-23", "2026-10-22"],
    ["2026-10-22", "2026-10-23"],
    ["2025-01-01", "2026-01-02"],
  ])
    assert.ok(validateOccupancyRange(from, to, "2026-10-22"));
  assert.equal(
    validateOccupancyRange("2024-01-01", "2024-12-31", "2026-10-22"),
    null,
  );
  assert.ok(validateOccupancyRange("2024-01-01", "2025-01-01", "2026-10-22"));
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-21T20:00:00Z") });
  try {
    assert.equal(getTodayString(), "2026-10-22");
  } finally {
    mock.timers.reset();
  }
});
