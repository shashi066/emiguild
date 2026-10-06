import { prisma } from '@/lib/prisma';
import { addIndiaCalendarDays, getIndiaClock } from '@/lib/public-booking-time';

export function cleanupAssistantUsage(now = new Date()) {
  const date = addIndiaCalendarDays(getIndiaClock(now).date, -90)!;
  return prisma.assistantUsageDaily.deleteMany({ where: { date: { lt: date } } });
}
