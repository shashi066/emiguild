import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { displayEmicFromUnits, EMIC_UNIT_FACTOR } from '@/lib/emic';
import { runSerializableTransaction } from '@/lib/prisma-transaction';

export const EMIC_REWARD_ORDER_PENDING = 'PENDING';
export const EMIC_REWARD_ORDER_GIVEN = 'GIVEN';
export const EMIC_REWARD_ORDER_CANCELLED = 'CANCELLED';

const EMIC_REWARDS_CATALOG_KEY = 'emic_rewards_catalog';
const ORDER_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 80;
const MAX_CATALOG_ITEMS = 60;
const MAX_EMIC_PRICE = 1_000_000;

export type EmicRewardCatalogItem = {
  itemKey: string;
  itemType: 'HOUR_PASS' | 'GUILD_MEMBERSHIP' | 'DRINK';
  label: string;
  category: string;
  detail: string;
  tokenCost: number;
  accent: string;
  isActive: boolean;
};

export const DEFAULT_EMIC_REWARD_ITEMS: EmicRewardCatalogItem[] = [
  { itemKey: 'BRONZE', label: 'Bronze Pass', category: 'Gaming', itemType: 'HOUR_PASS', detail: '10 hrs', tokenCost: 13_000, accent: 'bronze', isActive: true },
  { itemKey: 'SILVER', label: 'Silver Pass', category: 'Gaming', itemType: 'HOUR_PASS', detail: '20 hrs', tokenCost: 23_000, accent: 'silver', isActive: true },
  { itemKey: 'GOLD', label: 'Gold Pass', category: 'Gaming', itemType: 'HOUR_PASS', detail: '30 hrs', tokenCost: 30_000, accent: 'gold', isActive: true },
  { itemKey: 'BLACK', label: 'Black Pass', category: 'Racing', itemType: 'HOUR_PASS', detail: '10 hrs', tokenCost: 24_000, accent: 'black', isActive: true },
  { itemKey: 'APEX', label: 'Apex Pass', category: 'Racing', itemType: 'HOUR_PASS', detail: '15 hrs', tokenCost: 31_500, accent: 'apex', isActive: true },
  { itemKey: 'GUILD_HERO', label: 'Guild Hero', category: 'Guild', itemType: 'GUILD_MEMBERSHIP', detail: 'Membership ticket', tokenCost: 4_990, accent: 'guild-hero', isActive: true },
  { itemKey: 'GUILD_MASTER', label: 'Guild Master', category: 'Guild', itemType: 'GUILD_MEMBERSHIP', detail: 'Membership ticket', tokenCost: 9_990, accent: 'guild-master', isActive: true },
  { itemKey: 'DRINK_125', label: 'Premium Drink Coupon', category: 'Drinks', itemType: 'DRINK', detail: 'Counter coupon', tokenCost: 1_250, accent: 'drink', isActive: true },
  { itemKey: 'DRINK_60', label: 'Classic Drink Coupon', category: 'Drinks', itemType: 'DRINK', detail: 'Counter coupon', tokenCost: 600, accent: 'drink', isActive: true },
  { itemKey: 'DRINK_40', label: 'Quick Drink Coupon', category: 'Drinks', itemType: 'DRINK', detail: 'Counter coupon', tokenCost: 400, accent: 'drink', isActive: true },
  { itemKey: 'DRINK_20', label: 'Mini Drink Coupon', category: 'Drinks', itemType: 'DRINK', detail: 'Counter coupon', tokenCost: 200, accent: 'drink', isActive: true },
];

type Tx = Prisma.TransactionClient;
type SettingsClient = Pick<Tx, 'setting'> | Pick<typeof prisma, 'setting'>;
type PaginationInput = { skip?: unknown; take?: unknown };

export class EmicRewardsError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = 'EmicRewardsError';
  }
}

export function friendlyEmicRewardsError(error: unknown) {
  if (error instanceof EmicRewardsError) {
    return { error: error.message, code: error.code, status: error.status };
  }
  return { error: 'EMIC Rewards action failed. Please try again.', code: 'EMIC_REWARDS_FAILED', status: 500 };
}

function cleanText(value: unknown, field: string, maxLength: number) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maxLength) {
    throw new EmicRewardsError('INVALID_CATALOG', `${field} must be 1-${maxLength} characters.`);
  }
  return text;
}

export function validateEmicRewardCatalog(value: unknown): EmicRewardCatalogItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CATALOG_ITEMS) {
    throw new EmicRewardsError('INVALID_CATALOG', `Add between 1 and ${MAX_CATALOG_ITEMS} reward items.`);
  }

  const keys = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new EmicRewardsError('INVALID_CATALOG', `Item ${index + 1} is invalid.`);
    const source = raw as Record<string, unknown>;
    const suppliedKey = typeof source.itemKey === 'string' ? source.itemKey.trim().toUpperCase() : '';
    const itemKey = suppliedKey || `CUSTOM_${randomUUID().replaceAll('-', '').toUpperCase()}`;
    if (!/^[A-Z0-9_]{2,80}$/.test(itemKey) || keys.has(itemKey)) {
      throw new EmicRewardsError('INVALID_CATALOG', `Item ${index + 1} has an invalid or duplicate key.`);
    }
    keys.add(itemKey);

    const itemType = source.itemType;
    if (itemType !== 'HOUR_PASS' && itemType !== 'GUILD_MEMBERSHIP' && itemType !== 'DRINK') {
      throw new EmicRewardsError('INVALID_CATALOG', `Choose Pass or Food & Drink for item ${index + 1}.`);
    }
    const tokenCost = Number(source.tokenCost);
    if (!Number.isInteger(tokenCost) || tokenCost < 1 || tokenCost > MAX_EMIC_PRICE) {
      throw new EmicRewardsError('INVALID_CATALOG', `EMIC price for item ${index + 1} must be a whole number from 1 to ${MAX_EMIC_PRICE.toLocaleString('en-IN')}.`);
    }

    const existing = DEFAULT_EMIC_REWARD_ITEMS.find((item) => item.itemKey === itemKey);
    const isDrink = itemType === 'DRINK';
    return {
      itemKey,
      itemType,
      label: cleanText(source.label, `Name for item ${index + 1}`, 80),
      category: cleanText(source.category ?? existing?.category ?? (isDrink ? 'Food & Drink' : 'Passes'), `Category for item ${index + 1}`, 40),
      detail: cleanText(source.detail, `Description for item ${index + 1}`, 100),
      tokenCost,
      accent: cleanText(source.accent ?? existing?.accent ?? (isDrink ? 'drink' : 'apex'), `Style for item ${index + 1}`, 30),
      isActive: source.isActive !== false,
    };
  });
}

function cloneDefaults() {
  return DEFAULT_EMIC_REWARD_ITEMS.map((item) => ({ ...item }));
}

async function loadCatalog(client: SettingsClient = prisma) {
  const setting = await client.setting.findUnique({ where: { key: EMIC_REWARDS_CATALOG_KEY }, select: { value: true } });
  if (!setting) return cloneDefaults();
  try {
    return validateEmicRewardCatalog(JSON.parse(setting.value));
  } catch {
    return cloneDefaults();
  }
}

function normalizeSkip(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeTake(value: unknown, fallback = ORDER_PAGE_SIZE) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE_SIZE) : fallback;
}

function pageInfo(skip: number, take: number, loadedCount: number) {
  const hasMore = loadedCount > take;
  return { skip, take, hasMore, nextSkip: hasMore ? skip + take : null };
}

function serializeOrder(order: any) {
  return {
    id: order.id,
    itemKey: order.itemKey,
    itemType: order.itemType,
    label: order.itemLabel,
    category: order.itemCategory,
    tokenCost: order.tokenCost,
    status: order.status,
    requestedAt: order.createdAt?.toISOString?.() ?? null,
    givenAt: order.givenAt?.toISOString?.() ?? null,
    cancelledAt: order.cancelledAt?.toISOString?.() ?? null,
    userId: order.userId,
    userName: order.user?.name ?? 'User',
    userEmail: order.user?.email ?? '',
  };
}

function serializePublicOrder(order: any) {
  return {
    id: order.id,
    itemKey: order.itemKey,
    itemType: order.itemType,
    label: order.itemLabel,
    category: order.itemCategory,
    tokenCost: order.tokenCost,
    status: order.status,
  };
}

function serializePublicItem(item: EmicRewardCatalogItem) {
  return {
    itemKey: item.itemKey,
    itemType: item.itemType,
    label: item.label,
    category: item.category,
    detail: item.detail,
    tokenCost: item.tokenCost,
    accent: item.accent,
  };
}

export async function getAdminEmicRewardsConfig() {
  return { items: await loadCatalog() };
}

export async function updateAdminEmicRewardsConfig(value: unknown) {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const items = validateEmicRewardCatalog(body.items);
  await prisma.setting.upsert({
    where: { key: EMIC_REWARDS_CATALOG_KEY },
    create: { key: EMIC_REWARDS_CATALOG_KEY, label: 'EMIC Rewards catalog', value: JSON.stringify(items) },
    update: { value: JSON.stringify(items), label: 'EMIC Rewards catalog' },
  });
  return { items };
}

export async function getEmicRewards(userId?: string, tx?: Tx) {
  const client = tx ?? prisma;
  const [catalog, user, orders] = await Promise.all([
    loadCatalog(client),
    userId ? client.user.findUnique({ where: { id: userId }, select: { watchPartyCoins: true } }) : Promise.resolve(null),
    userId ? client.watchPartyShopOrder.findMany({
      where: { userId, status: { in: [EMIC_REWARD_ORDER_PENDING, EMIC_REWARD_ORDER_GIVEN] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }) : Promise.resolve([]),
  ]);

  return {
    walletCoins: userId ? displayEmicFromUnits(user?.watchPartyCoins ?? 0) : null,
    items: catalog.filter((item) => item.isActive).map(serializePublicItem),
    orders: orders.map(serializePublicOrder),
  };
}

export async function purchaseEmicReward(userId: string, itemKey: unknown) {
  const normalizedKey = typeof itemKey === 'string' ? itemKey.trim().toUpperCase() : '';

  return runSerializableTransaction(async (tx) => {
    const catalog = await loadCatalog(tx);
    const config = catalog.find((item) => item.itemKey === normalizedKey && item.isActive);
    if (!config) throw new EmicRewardsError('INVALID_REWARD_ITEM', 'Choose a valid EMIC reward.');
    const costUnits = config.tokenCost * EMIC_UNIT_FACTOR;
    const debited = await tx.user.updateMany({
      where: { id: userId, role: { in: ['USER', 'ADMIN'] }, watchPartyCoins: { gte: costUnits } },
      data: { watchPartyCoins: { decrement: costUnits } },
    });
    if (debited.count !== 1) {
      throw new EmicRewardsError('INSUFFICIENT_EMIC', 'Your EMIC balance is too low to redeem this item.', 409);
    }

    const [user, order] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { watchPartyCoins: true } }),
      tx.watchPartyShopOrder.create({
        data: {
          userId,
          itemKey: config.itemKey,
          itemType: config.itemType,
          itemLabel: config.label,
          itemCategory: config.category,
          tokenCost: config.tokenCost,
          tokenCostUnits: costUnits,
          status: EMIC_REWARD_ORDER_PENDING,
        },
      }),
    ]);
    await tx.watchPartyCoinLedger.create({
      data: { userId, amountUnits: -costUnits, balanceAfterUnits: user.watchPartyCoins, reason: 'SHOP_ORDER_PURCHASE', note: `${order.id}:${config.label}` },
    });
    return getEmicRewards(userId, tx);
  });
}

export async function getAdminEmicRewardOrders(input: PaginationInput = {}) {
  const skip = normalizeSkip(input.skip);
  const take = normalizeTake(input.take);
  const orders = await prisma.watchPartyShopOrder.findMany({
    where: { status: EMIC_REWARD_ORDER_PENDING },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    skip,
    take: take + 1,
  });
  return { orders: orders.slice(0, take).map(serializeOrder), pageInfo: pageInfo(skip, take, orders.length) };
}

export async function markEmicRewardGiven(adminId: string, orderId: string) {
  return runSerializableTransaction(async (tx) => {
    const order = await tx.watchPartyShopOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new EmicRewardsError('ORDER_NOT_FOUND', 'EMIC redemption not found.', 404);
    const changed = await tx.watchPartyShopOrder.updateMany({
      where: { id: orderId, status: EMIC_REWARD_ORDER_PENDING },
      data: { status: EMIC_REWARD_ORDER_GIVEN, givenAt: new Date(), givenById: adminId },
    });
    if (changed.count !== 1) throw new EmicRewardsError('ORDER_NOT_PENDING', 'This EMIC redemption is no longer pending.', 409);
    const updated = await tx.watchPartyShopOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return serializeOrder(updated);
  });
}

export async function cancelEmicRewardOrder(adminId: string, orderId: string) {
  return runSerializableTransaction(async (tx) => {
    const order = await tx.watchPartyShopOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new EmicRewardsError('ORDER_NOT_FOUND', 'EMIC redemption not found.', 404);
    const changed = await tx.watchPartyShopOrder.updateMany({
      where: { id: orderId, status: EMIC_REWARD_ORDER_PENDING },
      data: { status: EMIC_REWARD_ORDER_CANCELLED, cancelledAt: new Date(), cancelledById: adminId },
    });
    if (changed.count !== 1) throw new EmicRewardsError('ORDER_NOT_PENDING', 'This EMIC redemption is no longer pending.', 409);
    const user = await tx.user.update({ where: { id: order.userId }, data: { watchPartyCoins: { increment: order.tokenCostUnits } }, select: { watchPartyCoins: true } });
    const cancelled = await tx.watchPartyShopOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    await tx.watchPartyCoinLedger.create({
      data: { userId: order.userId, actorId: adminId, amountUnits: order.tokenCostUnits, balanceAfterUnits: user.watchPartyCoins, reason: 'SHOP_ORDER_REFUND', note: `${order.id}:${order.itemLabel}` },
    });
    return serializeOrder(cancelled);
  });
}
