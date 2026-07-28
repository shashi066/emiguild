import { prisma } from '@/lib/prisma';
import {
  GuildMembershipRecord,
  GuildMembershipPlan,
  GuildMembershipType,
  getGuildMembershipPlan,
  normalizeGuildMembershipPlans,
  selectPreferredGuildMembership,
} from '@/lib/guild-membership';

const GUILD_PLAN_SETTING_KEY = 'guild_membership_plans';
const SERIALIZABLE_RETRY_LIMIT = 2;

export async function loadGuildMembershipPlans(): Promise<GuildMembershipPlan[]> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: GUILD_PLAN_SETTING_KEY },
      select: { value: true },
    });
    return normalizeGuildMembershipPlans(setting ? JSON.parse(setting.value) : null);
  } catch (error) {
    console.error('[guild-membership] Failed to load plan settings:', error);
    return normalizeGuildMembershipPlans(null);
  }
}

export async function updateGuildMembershipPlan(
  type: GuildMembershipType,
  updates: Pick<GuildMembershipPlan, 'price' | 'validityDays' | 'description' | 'isActive'>,
) {
  const plans = await loadGuildMembershipPlans();
  const updatedPlans = plans.map((plan) =>
    plan.type === type ? { ...plan, ...updates } : plan
  );
  const storedValue = Object.fromEntries(updatedPlans.map((plan) => [
    plan.type,
    {
      price: plan.price,
      validityDays: plan.validityDays,
      description: plan.description,
      isActive: plan.isActive,
    },
  ]));

  await prisma.setting.upsert({
    where: { key: GUILD_PLAN_SETTING_KEY },
    create: {
      key: GUILD_PLAN_SETTING_KEY,
      label: 'Guild Membership Plans',
      value: JSON.stringify(storedValue),
    },
    update: { value: JSON.stringify(storedValue) },
  });

  return getGuildMembershipPlan(updatedPlans, type);
}

export async function findActiveGuildMembership(
  userId: string,
  requestedType?: GuildMembershipType,
): Promise<GuildMembershipRecord | null> {
  const now = new Date();
  const memberships = await prisma.userPass.findMany({
    where: {
      userId,
      ...(requestedType
        ? { passType: requestedType }
        : { passType: { in: ['GUILD_HERO', 'GUILD_MASTER'] } }),
      status: 'ACTIVE',
      expiresAt: { gte: now },
    },
    select: {
      id: true,
      passType: true,
      status: true,
      purchasedAt: true,
      expiresAt: true,
    },
    orderBy: { expiresAt: 'desc' },
  });

  return requestedType
    ? memberships[0] ?? null
    : selectPreferredGuildMembership(memberships, now);
}

export async function assignGuildMembership({
  userId,
  passType,
  price,
  validityDays,
  now = new Date(),
}: {
  userId: string;
  passType: GuildMembershipType;
  price: number;
  validityDays: number;
  now?: Date;
}) {
  const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

  for (let attempt = 0; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.userPass.updateMany({
          where: {
            userId,
            passType: { in: ['GUILD_HERO', 'GUILD_MASTER'] },
            status: 'ACTIVE',
            expiresAt: { lt: now },
          },
          data: { status: 'EXPIRED' },
        });

        const existingMembership = await tx.userPass.findFirst({
          where: {
            userId,
            passType: { in: ['GUILD_HERO', 'GUILD_MASTER'] },
            status: 'ACTIVE',
            expiresAt: { gte: now },
          },
          select: { id: true },
        });
        if (existingMembership) {
          return { pass: null, existingMembership };
        }

        const pass = await tx.userPass.create({
          data: {
            userId,
            passType,
            totalHours: 0,
            price,
            expiresAt,
          },
        });

        return { pass, existingMembership: null };
      }, {
        isolationLevel: 'Serializable',
      });
    } catch (error) {
      const retryable = (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'P2034'
      );
      if (!retryable || attempt === SERIALIZABLE_RETRY_LIMIT) throw error;
    }
  }

  throw new Error('Failed to assign Guild Membership.');
}
