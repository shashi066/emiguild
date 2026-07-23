import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_ARMORY_TRADE_DURATION_HOURS,
  DEFAULT_ARMORY_TRADE_GEM_COST,
  MAX_ARMORY_TRADE_DURATION_HOURS,
  MAX_ARMORY_TRADE_GEM_COST,
  MIN_ARMORY_TRADE_DURATION_HOURS,
  MIN_ARMORY_TRADE_GEM_COST,
  armoryTradeExpiresAt,
  availableTradeCopies,
} from '@/lib/armory-marketplace-rules';

const MARKETPLACE_SETTING_KEYS = {
  enabled: 'armory_marketplace_enabled',
  gemCost: 'armory_trade_gem_cost',
  durationHours: 'armory_trade_duration_hours',
} as const;

const MARKETPLACE_STATUSES = [
  'OPEN',
  'COMPLETED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type ArmoryMarketplaceStatus = typeof MARKETPLACE_STATUSES[number];

export type ArmoryMarketplaceConfig = {
  enabled: boolean;
  gemCost: number;
  durationHours: number;
};

export type ArmoryMarketplaceAdminQuery = {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
};

const artifactSelect = {
  id: true,
  setId: true,
  slotType: true,
  name: true,
  set: {
    select: {
      id: true,
      name: true,
      shortLabel: true,
      rarity: true,
    },
  },
} as const;

const listingInclude = {
  seller: { select: { id: true, name: true, guildGems: true } },
  buyer: { select: { id: true, name: true } },
  offeredArtifact: { select: artifactSelect },
  requestedArtifact: { select: artifactSelect },
} as const;

const adminListingInclude = {
  seller: { select: { id: true, name: true, email: true } },
  buyer: { select: { id: true, name: true, email: true } },
  offeredArtifact: { select: artifactSelect },
  requestedArtifact: { select: artifactSelect },
} as const;

type ListingWithDetails = Prisma.ArmoryTradeListingGetPayload<{
  include: typeof listingInclude;
}>;

type AdminListingWithDetails = Prisma.ArmoryTradeListingGetPayload<{
  include: typeof adminListingInclude;
}>;

type ExpireOptions = {
  sellerId?: string;
  listingId?: string;
};

export class ArmoryMarketplaceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'ArmoryMarketplaceError';
  }
}

function loadoutArtifactIds(loadout: {
  headgearArtifactId?: string | null;
  armorArtifactId?: string | null;
  glovesArtifactId?: string | null;
  bootsArtifactId?: string | null;
} | null) {
  return [
    loadout?.headgearArtifactId,
    loadout?.armorArtifactId,
    loadout?.glovesArtifactId,
    loadout?.bootsArtifactId,
  ];
}

function parseBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

function validateMarketplaceConfig(input: unknown): ArmoryMarketplaceConfig {
  const body = input as Record<string, unknown> | null;
  if (
    !body
    || typeof body.enabled !== 'boolean'
    || !Number.isInteger(Number(body.gemCost))
    || Number(body.gemCost) < MIN_ARMORY_TRADE_GEM_COST
    || Number(body.gemCost) > MAX_ARMORY_TRADE_GEM_COST
    || !Number.isInteger(Number(body.durationHours))
    || Number(body.durationHours) < MIN_ARMORY_TRADE_DURATION_HOURS
    || Number(body.durationHours) > MAX_ARMORY_TRADE_DURATION_HOURS
  ) {
    throw new ArmoryMarketplaceError(
      'INVALID_MARKETPLACE_SETTINGS',
      `Trade cost must be ${MIN_ARMORY_TRADE_GEM_COST}-${MAX_ARMORY_TRADE_GEM_COST} Gems and expiry must be ${MIN_ARMORY_TRADE_DURATION_HOURS}-${MAX_ARMORY_TRADE_DURATION_HOURS} hours.`,
    );
  }

  return {
    enabled: body.enabled,
    gemCost: Number(body.gemCost),
    durationHours: Number(body.durationHours),
  };
}

export async function getArmoryMarketplaceConfig() {
  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: Object.values(MARKETPLACE_SETTING_KEYS),
      },
    },
    select: { key: true, value: true },
  });
  const settings = new Map(rows.map((row) => [row.key, row.value]));

  return {
    enabled: settings.get(MARKETPLACE_SETTING_KEYS.enabled) !== 'false',
    gemCost: parseBoundedInteger(
      settings.get(MARKETPLACE_SETTING_KEYS.gemCost),
      DEFAULT_ARMORY_TRADE_GEM_COST,
      MIN_ARMORY_TRADE_GEM_COST,
      MAX_ARMORY_TRADE_GEM_COST,
    ),
    durationHours: parseBoundedInteger(
      settings.get(MARKETPLACE_SETTING_KEYS.durationHours),
      DEFAULT_ARMORY_TRADE_DURATION_HOURS,
      MIN_ARMORY_TRADE_DURATION_HOURS,
      MAX_ARMORY_TRADE_DURATION_HOURS,
    ),
  } satisfies ArmoryMarketplaceConfig;
}

export async function updateArmoryMarketplaceConfig(input: unknown) {
  const config = validateMarketplaceConfig(input);
  const rows = [
    {
      key: MARKETPLACE_SETTING_KEYS.enabled,
      value: String(config.enabled),
      label: 'Enable Artifact Exchange',
    },
    {
      key: MARKETPLACE_SETTING_KEYS.gemCost,
      value: String(config.gemCost),
      label: 'Artifact Exchange Trade Cost Per User',
    },
    {
      key: MARKETPLACE_SETTING_KEYS.durationHours,
      value: String(config.durationHours),
      label: 'Artifact Exchange Listing Hours',
    },
  ];

  await prisma.$transaction(rows.map((row) => (
    prisma.setting.upsert({
      where: { key: row.key },
      update: { value: row.value, label: row.label },
      create: row,
    })
  )));

  return config;
}

function serializeListing(listing: ListingWithDetails, userId: string, canAccept = false) {
  return {
    id: listing.id,
    status: listing.status,
    gemCost: listing.gemCost,
    expiresAt: listing.expiresAt.toISOString(),
    completedAt: listing.completedAt?.toISOString() ?? null,
    cancelledAt: listing.cancelledAt?.toISOString() ?? null,
    createdAt: listing.createdAt.toISOString(),
    seller: { name: listing.seller.name },
    buyer: listing.buyer ? { name: listing.buyer.name } : null,
    offeredArtifact: listing.offeredArtifact,
    requestedArtifact: listing.requestedArtifact,
    isOwn: listing.sellerId === userId,
    canAccept,
  };
}

function serializeAdminListing(listing: AdminListingWithDetails) {
  return {
    id: listing.id,
    status: listing.status,
    gemCost: listing.gemCost,
    expiresAt: listing.expiresAt.toISOString(),
    completedAt: listing.completedAt?.toISOString() ?? null,
    cancelledAt: listing.cancelledAt?.toISOString() ?? null,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    seller: listing.seller,
    buyer: listing.buyer,
    offeredArtifact: listing.offeredArtifact,
    requestedArtifact: listing.requestedArtifact,
  };
}

export function friendlyMarketplaceError(error: unknown) {
  if (error instanceof ArmoryMarketplaceError) {
    return { error: error.message, code: error.code, status: error.status };
  }

  const prismaError = error as { code?: string };
  if (prismaError?.code === 'P2002') {
    return {
      error: 'You already have an artifact listed. Remove it before listing another.',
      code: 'ACTIVE_LISTING_EXISTS',
      status: 409,
    };
  }

  console.error('Armory marketplace error:', error);
  return {
    error: 'The Artifact Exchange action could not be completed.',
    code: 'MARKETPLACE_FAILED',
    status: 500,
  };
}

export async function expireArmoryTradeListings(options: ExpireOptions = {}) {
  const now = new Date();
  const expired = await prisma.armoryTradeListing.findMany({
    where: {
      status: 'OPEN',
      expiresAt: { lte: now },
      ...(options.sellerId ? { sellerId: options.sellerId } : {}),
      ...(options.listingId ? { id: options.listingId } : {}),
    },
    select: {
      id: true,
      sellerId: true,
      offeredArtifactId: true,
    },
    orderBy: { expiresAt: 'asc' },
    take: options.listingId || options.sellerId ? 1 : 50,
  });

  if (expired.length === 0) return 0;

  return prisma.$transaction(async (tx) => {
    let returned = 0;

    for (const listing of expired) {
      const closed = await tx.armoryTradeListing.updateMany({
        where: {
          id: listing.id,
          status: 'OPEN',
          expiresAt: { lte: now },
        },
        data: {
          status: 'EXPIRED',
          activeSellerKey: null,
        },
      });
      if (closed.count !== 1) continue;

      await tx.armoryInventory.upsert({
        where: {
          userId_artifactId: {
            userId: listing.sellerId,
            artifactId: listing.offeredArtifactId,
          },
        },
        update: { quantity: { increment: 1 } },
        create: {
          userId: listing.sellerId,
          artifactId: listing.offeredArtifactId,
          quantity: 1,
        },
      });
      returned += 1;
    }

    return returned;
  });
}

export async function getArmoryMarketplaceState(userId: string) {
  await expireArmoryTradeListings();

  const [
    config,
    user,
    listings,
    history,
    inventory,
    loadout,
    artifacts,
  ] = await Promise.all([
    getArmoryMarketplaceConfig(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, guildGems: true },
    }),
    prisma.armoryTradeListing.findMany({
      where: {
        status: 'OPEN',
        expiresAt: { gt: new Date() },
      },
      include: listingInclude,
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.armoryTradeListing.findMany({
      where: {
        OR: [{ sellerId: userId }, { buyerId: userId }],
        status: { in: ['COMPLETED', 'CANCELLED', 'EXPIRED'] },
      },
      include: listingInclude,
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.armoryInventory.findMany({
      where: { userId, quantity: { gt: 0 } },
      select: {
        artifactId: true,
        quantity: true,
        artifact: { select: artifactSelect },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.armoryLoadout.findUnique({
      where: { userId },
      select: {
        headgearArtifactId: true,
        armorArtifactId: true,
        glovesArtifactId: true,
        bootsArtifactId: true,
      },
    }),
    prisma.armoryArtifact.findMany({
      where: { active: true, set: { active: true } },
      select: artifactSelect,
      orderBy: [
        { set: { displayOrder: 'asc' } },
        { displayOrder: 'asc' },
      ],
    }),
  ]);

  if (!user) {
    throw new ArmoryMarketplaceError('USER_NOT_FOUND', 'User not found.', 404);
  }

  const equippedIds = loadoutArtifactIds(loadout);
  const availableInventory = inventory
    .map((row) => ({
      artifact: row.artifact,
      quantity: row.quantity,
      availableQuantity: availableTradeCopies(
        row.quantity,
        row.artifactId,
        equippedIds,
      ),
    }))
    .filter((row) => row.availableQuantity > 0);
  const availableByArtifact = new Map(
    availableInventory.map((row) => [row.artifact.id, row.availableQuantity]),
  );

  const serializedListings = listings.map((listing) => serializeListing(
    listing,
    userId,
      config.enabled
      && listing.sellerId !== userId
      && listing.seller.guildGems >= listing.gemCost
      && user.guildGems >= listing.gemCost
      && (availableByArtifact.get(listing.requestedArtifactId) ?? 0) > 0,
  ));

  return {
    marketplaceEnabled: config.enabled,
    guildGems: user.guildGems,
    gemCost: config.gemCost,
    durationHours: config.durationHours,
    listings: serializedListings,
    myListing: serializedListings.find((listing) => listing.isOwn) ?? null,
    history: history.map((listing) => serializeListing(listing, userId)),
    inventory: availableInventory,
    artifacts,
  };
}

export async function createArmoryTradeListing(
  userId: string,
  offeredArtifactId: string,
  requestedArtifactId: string,
) {
  if (!offeredArtifactId || !requestedArtifactId) {
    throw new ArmoryMarketplaceError(
      'ARTIFACTS_REQUIRED',
      'Choose the artifact you are offering and the artifact you want.',
    );
  }
  if (offeredArtifactId === requestedArtifactId) {
    throw new ArmoryMarketplaceError(
      'SAME_ARTIFACT',
      'Choose a different artifact to receive.',
    );
  }

  await expireArmoryTradeListings({ sellerId: userId });
  const config = await getArmoryMarketplaceConfig();
  if (!config.enabled) {
    throw new ArmoryMarketplaceError(
      'MARKETPLACE_DISABLED',
      'The Artifact Exchange is currently paused.',
      409,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const [existing, artifacts, inventory, loadout, seller] = await Promise.all([
        tx.armoryTradeListing.findUnique({
          where: { activeSellerKey: userId },
          select: { id: true },
        }),
        tx.armoryArtifact.findMany({
          where: {
            id: { in: [offeredArtifactId, requestedArtifactId] },
            active: true,
            set: { active: true },
          },
          select: { id: true },
        }),
        tx.armoryInventory.findUnique({
          where: {
            userId_artifactId: {
              userId,
              artifactId: offeredArtifactId,
            },
          },
          select: { quantity: true },
        }),
        tx.armoryLoadout.findUnique({
          where: { userId },
          select: {
            headgearArtifactId: true,
            armorArtifactId: true,
            glovesArtifactId: true,
            bootsArtifactId: true,
          },
        }),
        tx.user.findUnique({
          where: { id: userId },
          select: { guildGems: true },
        }),
      ]);

      if (existing) {
        throw new ArmoryMarketplaceError(
          'ACTIVE_LISTING_EXISTS',
          'Remove your current listing before placing another artifact.',
          409,
        );
      }
      if (artifacts.length !== 2) {
        throw new ArmoryMarketplaceError(
          'INVALID_ARTIFACT',
          'One of the selected artifacts is unavailable.',
        );
      }
      if (!seller || seller.guildGems < config.gemCost) {
        throw new ArmoryMarketplaceError(
          'NOT_ENOUGH_GEMS',
          `You need ${config.gemCost} Guild Gem${config.gemCost === 1 ? '' : 's'} to list an artifact.`,
        );
      }

      const equippedIds = loadoutArtifactIds(loadout);
      const equippedCopies = equippedIds.filter((id) => id === offeredArtifactId).length;
      if (!inventory || availableTradeCopies(
        inventory.quantity,
        offeredArtifactId,
        equippedIds,
      ) < 1) {
        throw new ArmoryMarketplaceError(
          'NO_FREE_COPY',
          'Unequip this artifact or collect another copy before listing it.',
        );
      }

      const escrowed = await tx.armoryInventory.updateMany({
        where: {
          userId,
          artifactId: offeredArtifactId,
          quantity: { gte: equippedCopies + 1 },
        },
        data: { quantity: { decrement: 1 } },
      });
      if (escrowed.count !== 1) {
        throw new ArmoryMarketplaceError(
          'NO_FREE_COPY',
          'This artifact is no longer available to list.',
          409,
        );
      }

      return tx.armoryTradeListing.create({
        data: {
          sellerId: userId,
          offeredArtifactId,
          requestedArtifactId,
          activeSellerKey: userId,
          gemCost: config.gemCost,
          expiresAt: armoryTradeExpiresAt(new Date(), config.durationHours),
        },
        include: listingInclude,
      });
    });
  } catch (error) {
    if (error instanceof ArmoryMarketplaceError) throw error;
    const prismaError = error as { code?: string };
    if (prismaError?.code === 'P2002') {
      throw new ArmoryMarketplaceError(
        'ACTIVE_LISTING_EXISTS',
        'Remove your current listing before placing another artifact.',
        409,
      );
    }
    throw error;
  }
}

async function cancelOpenArmoryTradeListing(
  listingId: string,
  sellerId?: string,
) {
  await expireArmoryTradeListings({ listingId });

  return prisma.$transaction(async (tx) => {
    const listing = await tx.armoryTradeListing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        sellerId: true,
        offeredArtifactId: true,
        status: true,
      },
    });
    if (!listing || (sellerId && listing.sellerId !== sellerId)) {
      throw new ArmoryMarketplaceError('LISTING_NOT_FOUND', 'Listing not found.', 404);
    }
    if (listing.status !== 'OPEN') {
      throw new ArmoryMarketplaceError(
        'LISTING_CLOSED',
        'This listing is no longer active.',
        409,
      );
    }

    const cancelled = await tx.armoryTradeListing.updateMany({
      where: {
        id: listing.id,
        status: 'OPEN',
        ...(sellerId ? { sellerId } : {}),
      },
      data: {
        status: 'CANCELLED',
        activeSellerKey: null,
        cancelledAt: new Date(),
      },
    });
    if (cancelled.count !== 1) {
      throw new ArmoryMarketplaceError(
        'LISTING_CLOSED',
        'This listing was already completed or removed.',
        409,
      );
    }

    await tx.armoryInventory.upsert({
      where: {
        userId_artifactId: {
          userId: listing.sellerId,
          artifactId: listing.offeredArtifactId,
        },
      },
      update: { quantity: { increment: 1 } },
      create: {
        userId: listing.sellerId,
        artifactId: listing.offeredArtifactId,
        quantity: 1,
      },
    });

    return tx.armoryTradeListing.findUniqueOrThrow({
      where: { id: listing.id },
      include: listingInclude,
    });
  });
}

export async function cancelArmoryTradeListing(userId: string, listingId: string) {
  return cancelOpenArmoryTradeListing(listingId, userId);
}

export async function cancelArmoryTradeListingAsAdmin(listingId: string) {
  return cancelOpenArmoryTradeListing(listingId);
}

export async function acceptArmoryTradeListing(userId: string, listingId: string) {
  await expireArmoryTradeListings({ listingId });
  const config = await getArmoryMarketplaceConfig();
  if (!config.enabled) {
    throw new ArmoryMarketplaceError(
      'MARKETPLACE_DISABLED',
      'The Artifact Exchange is currently paused.',
      409,
    );
  }

  return prisma.$transaction(async (tx) => {
    const listing = await tx.armoryTradeListing.findUnique({
      where: { id: listingId },
      include: listingInclude,
    });
    if (!listing || listing.status !== 'OPEN') {
      throw new ArmoryMarketplaceError(
        'LISTING_CLOSED',
        'This listing is no longer available.',
        409,
      );
    }
    if (listing.sellerId === userId) {
      throw new ArmoryMarketplaceError(
        'OWN_LISTING',
        'You cannot accept your own listing.',
      );
    }

    const [inventory, loadout] = await Promise.all([
      tx.armoryInventory.findUnique({
        where: {
          userId_artifactId: {
            userId,
            artifactId: listing.requestedArtifactId,
          },
        },
        select: { quantity: true },
      }),
      tx.armoryLoadout.findUnique({
        where: { userId },
        select: {
          headgearArtifactId: true,
          armorArtifactId: true,
          glovesArtifactId: true,
          bootsArtifactId: true,
        },
      }),
    ]);

    const equippedIds = loadoutArtifactIds(loadout);
    const equippedCopies = equippedIds.filter(
      (id) => id === listing.requestedArtifactId,
    ).length;
    if (!inventory || availableTradeCopies(
      inventory.quantity,
      listing.requestedArtifactId,
      equippedIds,
    ) < 1) {
      throw new ArmoryMarketplaceError(
        'REQUESTED_ARTIFACT_NOT_AVAILABLE',
        `You need one unequipped ${listing.requestedArtifact.name} to accept this trade.`,
      );
    }

    const claimed = await tx.armoryTradeListing.updateMany({
      where: {
        id: listing.id,
        status: 'OPEN',
        expiresAt: { gt: new Date() },
      },
      data: {
        status: 'COMPLETED',
        activeSellerKey: null,
        buyerId: userId,
        completedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new ArmoryMarketplaceError(
        'LISTING_CLOSED',
        'Another user completed this trade first.',
        409,
      );
    }

    const buyerPaid = await tx.user.updateMany({
      where: {
        id: userId,
        guildGems: { gte: listing.gemCost },
      },
      data: {
        guildGems: { decrement: listing.gemCost },
      },
    });
    if (buyerPaid.count !== 1) {
      throw new ArmoryMarketplaceError(
        'NOT_ENOUGH_GEMS',
        `You need ${listing.gemCost} Guild Gem${listing.gemCost === 1 ? '' : 's'} to accept this trade.`,
      );
    }

    const sellerPaid = await tx.user.updateMany({
      where: {
        id: listing.sellerId,
        guildGems: { gte: listing.gemCost },
      },
      data: {
        guildGems: { decrement: listing.gemCost },
      },
    });
    if (sellerPaid.count !== 1) {
      throw new ArmoryMarketplaceError(
        'SELLER_NOT_ENOUGH_GEMS',
        'This trade is temporarily unavailable because its owner does not have enough Guild Gems.',
        409,
      );
    }

    const transferred = await tx.armoryInventory.updateMany({
      where: {
        userId,
        artifactId: listing.requestedArtifactId,
        quantity: { gte: equippedCopies + 1 },
      },
      data: { quantity: { decrement: 1 } },
    });
    if (transferred.count !== 1) {
      throw new ArmoryMarketplaceError(
        'REQUESTED_ARTIFACT_NOT_AVAILABLE',
        'That artifact is no longer available in your inventory.',
        409,
      );
    }

    await Promise.all([
      tx.armoryInventory.upsert({
        where: {
          userId_artifactId: {
            userId,
            artifactId: listing.offeredArtifactId,
          },
        },
        update: { quantity: { increment: 1 } },
        create: {
          userId,
          artifactId: listing.offeredArtifactId,
          quantity: 1,
        },
      }),
      tx.armoryInventory.upsert({
        where: {
          userId_artifactId: {
            userId: listing.sellerId,
            artifactId: listing.requestedArtifactId,
          },
        },
        update: { quantity: { increment: 1 } },
        create: {
          userId: listing.sellerId,
          artifactId: listing.requestedArtifactId,
          quantity: 1,
        },
      }),
    ]);

    const [buyer, seller] = await Promise.all([
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { guildGems: true },
      }),
      tx.user.findUniqueOrThrow({
        where: { id: listing.sellerId },
        select: { guildGems: true },
      }),
    ]);
    await tx.guildGemLedger.createMany({
      data: [
        {
          userId,
          amount: -listing.gemCost,
          balanceAfter: buyer.guildGems,
          reason: 'MARKETPLACE_TRADE_FEE',
          referenceId: listing.id,
          note: 'Buyer trade fee',
        },
        {
          userId: listing.sellerId,
          amount: -listing.gemCost,
          balanceAfter: seller.guildGems,
          reason: 'MARKETPLACE_TRADE_FEE',
          referenceId: listing.id,
          note: 'Seller trade fee',
        },
      ],
    });

    return tx.armoryTradeListing.findUniqueOrThrow({
      where: { id: listing.id },
      include: listingInclude,
    });
  });
}

export async function getArmoryMarketplaceAdminState(
  query: ArmoryMarketplaceAdminQuery = {},
) {
  await expireArmoryTradeListings();

  const rawStatus = String(query.status || 'OPEN').toUpperCase();
  if (
    rawStatus !== 'ALL'
    && !MARKETPLACE_STATUSES.includes(rawStatus as ArmoryMarketplaceStatus)
  ) {
    throw new ArmoryMarketplaceError(
      'INVALID_MARKETPLACE_STATUS',
      'Choose a valid Artifact Exchange status.',
    );
  }

  const status = rawStatus as ArmoryMarketplaceStatus | 'ALL';
  const search = String(query.search || '').trim().slice(0, 100);
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const limit = Math.min(50, Math.max(1, Math.floor(Number(query.limit) || 20)));
  const where: Prisma.ArmoryTradeListingWhereInput = {
    ...(status === 'ALL' ? {} : { status }),
    ...(search
      ? {
        OR: [
          { seller: { is: { name: { contains: search } } } },
          { seller: { is: { email: { contains: search } } } },
          { buyer: { is: { name: { contains: search } } } },
          { buyer: { is: { email: { contains: search } } } },
          { offeredArtifact: { is: { name: { contains: search } } } },
          { requestedArtifact: { is: { name: { contains: search } } } },
        ],
      }
      : {}),
  };

  const [config, rows, total, grouped] = await Promise.all([
    getArmoryMarketplaceConfig(),
    prisma.armoryTradeListing.findMany({
      where,
      include: adminListingInclude,
      orderBy: status === 'OPEN'
        ? { expiresAt: 'asc' }
        : { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.armoryTradeListing.count({ where }),
    prisma.armoryTradeListing.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ]);

  const summary = {
    OPEN: 0,
    COMPLETED: 0,
    EXPIRED: 0,
    CANCELLED: 0,
  };
  for (const row of grouped) {
    if (MARKETPLACE_STATUSES.includes(row.status as ArmoryMarketplaceStatus)) {
      summary[row.status as ArmoryMarketplaceStatus] = row._count._all;
    }
  }

  return {
    settings: config,
    summary,
    listings: rows.map(serializeAdminListing),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function searchArmoryMarketplaceGemUsers(search: string) {
  const query = search.trim().slice(0, 100);
  if (query.length < 2) return [];

  return prisma.user.findMany({
    where: {
      role: 'USER',
      OR: [
        { name: { contains: query } },
        { email: { contains: query } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      guildGems: true,
    },
    orderBy: { name: 'asc' },
    take: 12,
  });
}

export async function getArmoryMarketplaceGemAccount(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'USER' },
    select: {
      id: true,
      name: true,
      email: true,
      guildGems: true,
      guildGemLedger: {
        select: {
          id: true,
          amount: true,
          balanceAfter: true,
          reason: true,
          referenceId: true,
          note: true,
          createdAt: true,
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!user) {
    throw new ArmoryMarketplaceError(
      'USER_NOT_FOUND',
      'User not found.',
      404,
    );
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    guildGems: user.guildGems,
    ledger: user.guildGemLedger.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export async function adjustArmoryGuildGems(
  adminId: string,
  userId: string,
  rawAmount: unknown,
  rawNote: unknown,
) {
  const amount = Number(rawAmount);
  const note = typeof rawNote === 'string' ? rawNote.trim() : '';
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 10_000) {
    throw new ArmoryMarketplaceError(
      'INVALID_GEM_ADJUSTMENT',
      'Gem adjustment must be a non-zero whole number between -10000 and 10000.',
    );
  }
  if (note.length < 3 || note.length > 160) {
    throw new ArmoryMarketplaceError(
      'INVALID_ADJUSTMENT_REASON',
      'Enter a reason between 3 and 160 characters.',
    );
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, role: 'USER' },
      select: { guildGems: true },
    });
    if (!user) {
      throw new ArmoryMarketplaceError(
        'USER_NOT_FOUND',
        'User not found.',
        404,
      );
    }
    if (user.guildGems + amount < 0) {
      throw new ArmoryMarketplaceError(
        'NEGATIVE_GEM_BALANCE',
        'This adjustment would make the user\'s Guild Gem balance negative.',
        409,
      );
    }

    const updated = await tx.user.updateMany({
      where: {
        id: userId,
        role: 'USER',
        ...(amount < 0 ? { guildGems: { gte: Math.abs(amount) } } : {}),
      },
      data: { guildGems: { increment: amount } },
    });
    if (updated.count !== 1) {
      throw new ArmoryMarketplaceError(
        'GEM_BALANCE_CHANGED',
        'The Gem balance changed. Refresh the user and try again.',
        409,
      );
    }

    const balance = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { guildGems: true },
    });
    await tx.guildGemLedger.create({
      data: {
        userId,
        actorId: adminId,
        amount,
        balanceAfter: balance.guildGems,
        reason: 'ADMIN_ADJUSTMENT',
        note,
      },
    });
  });

  return getArmoryMarketplaceGemAccount(userId);
}
