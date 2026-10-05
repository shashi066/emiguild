import { prisma } from '@/lib/prisma';
import { loadGuildMembershipPlans } from '@/lib/guild-membership-server';
import { loadActiveSpecialOpening } from '@/lib/special-opening-server';
import { parsePs5RentalPrice, resolvePs5RentalAvailability } from '@/lib/ps5-rental';
import { PUBLIC_HELP_TOPICS } from './public-help';

// No user/session arguments and no private tables. Never replace with page
// fetching or the broad /api/settings response, which is not a knowledge allowlist.
export async function loadPublicKnowledge() {
  const [stations, games, plans, settings, opening] = await Promise.all([
    prisma.station.findMany({ where: { isActive: true }, select: { name: true, hourlyRate: true, minDuration: true, hasControllers: true }, orderBy: { position: 'asc' }, take: 50 }),
    prisma.game.findMany({ where: { isActive: true }, select: { name: true, category: true }, orderBy: { name: 'asc' }, take: 201 }),
    loadGuildMembershipPlans(),
    prisma.setting.findMany({ where: { key: { in: ['controller_price', 'ps5_rental_status', 'ps5_rental_enabled', 'ps5_rental_price_per_day', 'ps5_rental_extra_controller'] } }, select: { key: true, value: true } }),
    loadActiveSpecialOpening(),
  ]);
  const values = Object.fromEntries(settings.map(({ key, value }) => [key, value]));
  const controllerPrice = Number(values.controller_price ?? 0) || 0;
  return {
    topics: PUBLIC_HELP_TOPICS,
    publicFacts: {
      currency: 'INR', stations,
      extraControllerPricePerHour: Number.isFinite(controllerPrice) && controllerPrice >= 0 ? controllerPrice : null,
      games: games.slice(0, 200), catalogueMayBeIncomplete: games.length > 200,
      guildPlans: plans.filter((plan) => plan.isActive).map(({ name, price, validityDays, soloDiscountPercentage, squadDiscountPercentage }) => ({ name, price, validityDays, soloDiscountPercentage, squadDiscountPercentage })),
      specialOpening: opening ? { date: opening.date, opensAt: opening.opensAt } : null,
      rental: { status: resolvePs5RentalAvailability(values), pricePerDay: parsePs5RentalPrice(values.ps5_rental_price_per_day, 1200), extraControllerPricePerDay: parsePs5RentalPrice(values.ps5_rental_extra_controller, 500) },
      guidance: 'Facts are a current snapshot, not a quote or reservation. Never infer real-time slot availability. Missing catalogue entries are not proof a game is unavailable. Hour-pass prices and event details must be checked on their pages.',
    },
  };
}
