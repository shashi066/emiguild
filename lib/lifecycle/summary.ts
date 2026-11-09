import { prisma } from '@/lib/prisma';
import { getEffectiveSpinDate, normalizeSpinResetHour } from '@/lib/daily-spin';
import { getMineEligibility } from '@/lib/guess-36-bonuses';
import { artifactProgress } from './games';

// The badge needs actionable destinations, not streaks, match history or reward descriptions.
export async function getVaultSummary(userId: string, now = new Date()) {
  const settings = await prisma.setting.findMany({ where: { key: { in: ['daily_spin_enabled', 'daily_spin_reset_hour', 'guess_36_mines_enabled', 'tower_enabled'] } }, select: { key: true, value: true } });
  const values = Object.fromEntries(settings.map((row) => [row.key, row.value]));
  const { spinDate } = getEffectiveSpinDate(normalizeSpinResetHour(values.daily_spin_reset_hour), now);
  const [tickets, spin, loot, eligibility, token, attempt, artifacts, mineActive] = await Promise.all([
    prisma.armoryTicket.findMany({ where: { userId, status: 'UNUSED', expiresAt: { gt: now } }, distinct: ['source'], select: { source: true } }),
    prisma.userDailySpin.findUnique({ where: { userId_spinDate: { userId, spinDate } }, select: { id: true } }),
    prisma.lootItem.findFirst({ where: { enabled: true, weight: { gt: 0 } }, select: { id: true } }),
    getMineEligibility(userId, now),
    prisma.towerToken.findFirst({ where: { userId, status: 'AVAILABLE', expiresAt: { gt: now } }, select: { id: true } }),
    prisma.towerAttempt.findFirst({ where: { userId, status: { in: ['IN_PROGRESS', 'COMPLETED'] }, runExpiresAt: { gt: now }, token: { expiresAt: { gt: now } } }, select: { id: true } }),
    artifactProgress(userId, now, false),
    prisma.guess36Entry.findFirst({ where: { userId, gameMode: 'MINES', mineStatus: 'ACTIVE' }, select: { id: true } }),
  ]);
  const pending = new Set<string>(tickets.map((ticket) => ticket.source === 'TOWER' ? '/tower' : ticket.source === 'GUESS_36' ? '/guess-36' : '/armory'));
  if (values.daily_spin_enabled !== 'false' && !spin && loot) pending.add('/daily-spin');
  if (mineActive || (values.guess_36_mines_enabled === 'true' && (eligibility.freeAvailable || eligibility.bonuses.length > 0))) pending.add('/guess-36');
  if (values.tower_enabled !== 'false' && (token || attempt)) pending.add('/tower');
  if (artifacts.game.facts?.dailyAvailable || artifacts.game.facts?.canClaim) pending.add('/armory');
  return { pendingCount: pending.size };
}
