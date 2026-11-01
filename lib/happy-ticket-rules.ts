import { z } from 'zod';
import { getIstDateKey, getNextIstMidnight } from './armory-clock';

export const HAPPY_CAPACITY = 5;
export const HAPPY_COOLDOWN_MS = 86_400_000;
export const happyConfigSchema = z.object({
  stationIds: z.array(z.string().min(1)).max(50),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[03]0$/),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[03]0$/),
}).strict().refine(c => minutes(c.endTime) - minutes(c.startTime) >= 60, 'Provide at least one hour.');
export type HappyConfig = z.infer<typeof happyConfigSchema>;
export const DEFAULT_HAPPY_CONFIG: HappyConfig = { stationIds: [], days: [1, 2, 3, 4, 5], startTime: '16:00', endTime: '23:00' };
export function readHappyConfig(raw: string): HappyConfig {
  try { const result = happyConfigSchema.safeParse(JSON.parse(raw)); return result.success ? result.data : DEFAULT_HAPPY_CONFIG; }
  catch { return DEFAULT_HAPPY_CONFIG; }
}
export function minutes(time: string) { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
export function happyExpiry(now: Date) { return getNextIstMidnight(now); }
export function bankedExpiry(now: Date) {
  const shifted = new Date(now.getTime() + 19_800_000);
  const day = shifted.getUTCDate();
  shifted.setUTCDate(1); shifted.setUTCMonth(shifted.getUTCMonth() + 1);
  const last = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(day, last));
  return new Date(shifted.getTime() - 19_800_000);
}
export function happyDay(date: string) { return new Date(`${date}T12:00:00+05:30`).getUTCDay(); }
export function hasHappyWindow(config: HappyConfig, now: Date) {
  const date = getIstDateKey(now);
  const end = Math.min(happyExpiry(now).getTime(), new Date(`${date}T${config.endTime}:00+05:30`).getTime());
  const start = Math.max(now.getTime(), new Date(`${date}T${config.startTime}:00+05:30`).getTime());
  return config.days.includes(happyDay(date)) && end - start >= 3_600_000;
}
export function happyBookingProblem(input: {
  config: HappyConfig; stationId: string; hasControllers: boolean; date: string; startTime: string;
  duration: number; expiresAt: Date; now: Date;
}) {
  const { config, now, expiresAt, duration, date, startTime } = input;
  if (now >= expiresAt) return 'This Happy Ticket has expired.';
  if (!input.hasControllers || !config.stationIds.includes(input.stationId)) return 'Choose an eligible PS5 station.';
  if (duration < 1) return 'Happy Tickets require at least a one-hour session.';
  if (!config.days.includes(happyDay(date))) return 'This ticket is not eligible on the selected day.';
  const start = new Date(`${date}T${startTime}:00+05:30`).getTime();
  if (!Number.isFinite(start) || start < now.getTime()) return 'Choose a future gaming session.';
  if (minutes(startTime) < minutes(config.startTime) || minutes(startTime) + 60 > minutes(config.endTime)) return 'The first gaming hour must fit the ticket hours.';
  if (start + duration * 3_600_000 > expiresAt.getTime()) return 'The full session must finish before ticket expiry.';
  return null;
}
