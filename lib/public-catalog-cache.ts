import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { normalizeGuildMembershipPlans } from '@/lib/guild-membership';
import { readGuildMembershipPlans } from '@/lib/guild-membership-server';

// Shared server-side cache for public catalogue data that changes about weekly. Admin saves clear it
// at once; the 24-hour revalidation only bounds edits made outside the admin screens. A stale entry is
// served immediately while it refreshes in the background, so visitors never wait for a refresh.
// Failures are never cached. Admin screens and paid flows keep reading the database directly.
const PLANS_TAG = 'public-guild-membership-plans';
const GAMES_TAG = 'public-active-games';
const REVALIDATE_SECONDS = 86_400;

const cachedPlans = unstable_cache(readGuildMembershipPlans, [PLANS_TAG], { revalidate: REVALIDATE_SECONDS, tags: [PLANS_TAG] });
const cachedGames = unstable_cache(
  () => prisma.game.findMany({
    where: { isActive: true },
    orderBy: [{ category: 'asc' }, { position: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, category: true },
  }),
  [GAMES_TAG],
  { revalidate: REVALIDATE_SECONDS, tags: [GAMES_TAG] },
);

export async function loadCachedGuildMembershipPlans() {
  try {
    return await cachedPlans();
  } catch (error) {
    console.error('[guild-membership] Failed to load plan settings:', error);
    return normalizeGuildMembershipPlans(null);
  }
}

export async function loadCachedActiveGames() {
  try {
    return await cachedGames();
  } catch (error) {
    console.error('Error fetching games:', error);
    return [];
  }
}

export function invalidateGuildMembershipPlans() {
  revalidateTag(PLANS_TAG, { expire: 0 });
}

export function invalidatePublicGames() {
  revalidateTag(GAMES_TAG, { expire: 0 });
}
