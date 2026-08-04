import { prisma } from '@/lib/prisma';
import {
  SPECIAL_OPENING_DATE_KEY,
  SPECIAL_OPENING_ENABLED_KEY,
  SPECIAL_OPENING_TIME_KEY,
  getActiveSpecialOpening,
  getIndiaClock,
  type ActiveSpecialOpening,
} from '@/lib/public-booking-time';

const SPECIAL_OPENING_KEYS = [
  SPECIAL_OPENING_ENABLED_KEY,
  SPECIAL_OPENING_DATE_KEY,
  SPECIAL_OPENING_TIME_KEY,
];

export async function loadActiveSpecialOpening(
  now: Date = new Date(),
): Promise<ActiveSpecialOpening | null> {
  const clock = getIndiaClock(now);
  const settings = await prisma.setting.findMany({
    where: { key: { in: SPECIAL_OPENING_KEYS } },
    select: { key: true, value: true },
  });

  return getActiveSpecialOpening(
    Object.fromEntries(settings.map((setting) => [setting.key, setting.value])),
    clock.date,
  );
}
