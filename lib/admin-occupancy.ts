import { prisma } from "@/lib/prisma";
import { calculateOccupancy, sumOccupancy, weekStart } from "./occupancy";
import { getTodayString } from "./utils";

export async function getAdminOccupancy(from: string, to: string) {
  const [bookings, setting] = await Promise.all([
    prisma.booking.findMany({
      where: { date: { gte: from, lte: to }, status: "CHECKED_IN" },
      select: {
        date: true,
        stationId: true,
        status: true,
        startTime: true,
        endTime: true,
      },
    }),
    prisma.setting.findUnique({
      where: { key: "venue_capacity" },
      select: { value: true },
    }),
  ]);
  return calculateOccupancy(bookings, setting?.value, from, to);
}
export async function getDashboardOccupancy() {
  const today = getTodayString(),
    month = today.slice(0, 7) + "-01",
    week = weekStart(today);
  const report = await getAdminOccupancy(week < month ? week : month, today);
  const monthRows = report.daily.filter((row) => row.key >= month);
  const weekend = (date: string) =>
    [0, 6].includes(new Date(date + "T00:00:00Z").getUTCDay());
  return [
    {
      label: "Today",
      ...sumOccupancy(report.daily.filter((row) => row.key === today)),
    },
    {
      label: "This Week",
      ...sumOccupancy(report.daily.filter((row) => row.key >= week)),
    },
    { label: "This Month", ...sumOccupancy(monthRows) },
    {
      label: "Weekdays",
      ...sumOccupancy(monthRows.filter((row) => !weekend(row.key))),
    },
    {
      label: "Weekends",
      ...sumOccupancy(monthRows.filter((row) => weekend(row.key))),
    },
  ];
}
