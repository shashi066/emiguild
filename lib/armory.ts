import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { encryptNumber } from '@/lib/crypto';
import { expireArmoryTradeListings } from '@/lib/armory-marketplace';

export const ARMORY_SLOTS = ['HEADGEAR', 'ARMOR', 'GLOVES', 'BOOTS'] as const;
export type ArmorySlot = typeof ARMORY_SLOTS[number];

export const ARMORY_SETTING_KEYS = [
  'armory_enabled',
] as const;

export const DEFAULT_ARMORY_SETS = [
  { id: 'iron_vanguard', name: 'Iron Vanguard', shortLabel: 'Vanguard', rarity: 'BRONZE', dropPercentage: 40, displayOrder: 1 },
  { id: 'silver_phantom', name: 'Silver Phantom', shortLabel: 'Phantom', rarity: 'SILVER', dropPercentage: 30, displayOrder: 2 },
  { id: 'golden_titan', name: 'Golden Titan', shortLabel: 'Titan', rarity: 'GOLD', dropPercentage: 20, displayOrder: 3 },
  { id: 'platinum_sovereign', name: 'Platinum Sovereign', shortLabel: 'Sovereign', rarity: 'PLATINUM', dropPercentage: 10, displayOrder: 4 },
] as const;

const DEFAULT_SLOT_WEIGHTS: Record<ArmorySlot, number> = {
  HEADGEAR: 10,
  ARMOR: 20,
  GLOVES: 30,
  BOOTS: 40,
};

export const ADMIN_GRANT_SLOT_WEIGHTS: Readonly<Record<ArmorySlot, number>> = {
  HEADGEAR: 10,
  ARMOR: 20,
  GLOVES: 30,
  BOOTS: 40,
};

const ADMIN_GRANT_SLOT_ORDER: ArmorySlot[] = ['BOOTS', 'GLOVES', 'ARMOR', 'HEADGEAR'];
const ADMIN_GRANT_RARITIES = new Set(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']);
type RandomInt = (minimum: number, maximum: number) => number;

const ARMORY_DEFAULTS_VERSION_KEY = 'armory_defaults_version';
const ARMORY_DEFAULTS_VERSION = 'launch_rewards_v2';
let armoryDefaultsReady = false;
let armoryForgeConfigCache: {
  expiresAt: number;
  enabled: boolean;
  sets: Array<{
    id: string;
    dropPercentage: number;
    artifacts: Array<{
      id: string;
      setId: string;
      slotType: string;
      name: string;
      active: boolean;
      slotDropPercentage: number;
      displayOrder: number;
      set: {
        id: string;
        name: string;
        shortLabel: string;
        rarity: string;
        dropPercentage: number;
        active: boolean;
        displayOrder: number;
      };
    }>;
  }>;
} | null = null;

const ARTIFACT_NAMES: Record<string, Record<ArmorySlot, string>> = {
  iron_vanguard: {
    HEADGEAR: 'Vanguard Helm',
    ARMOR: 'Vanguard Armor',
    GLOVES: 'Vanguard Gloves',
    BOOTS: 'Vanguard Boots',
  },
  silver_phantom: {
    HEADGEAR: 'Phantom Visor',
    ARMOR: 'Phantom Armor',
    GLOVES: 'Phantom Gloves',
    BOOTS: 'Phantom Boots',
  },
  golden_titan: {
    HEADGEAR: 'Titan Crown',
    ARMOR: 'Titan Armor',
    GLOVES: 'Titan Gauntlets',
    BOOTS: 'Titan Boots',
  },
  platinum_sovereign: {
    HEADGEAR: 'Sovereign Headgear',
    ARMOR: 'Sovereign Armor',
    GLOVES: 'Sovereign Gloves',
    BOOTS: 'Sovereign Boots',
  },
};

const DEFAULT_REWARDS: Record<string, any> = {
  iron_vanguard: {
    rewardType: 'GAMING_MINUTES',
    gamingMinutes: 30,
    validityDays: 7,
    eligibleStations: 'Standard gaming stations only',
    description: '30 Minutes Gaming',
  },
  silver_phantom: {
    rewardType: 'RACING_MINUTES',
    racingMinutes: 30,
    validityDays: 7,
    eligibleStations: 'Racing wheel stations only',
    description: '30 Minutes Racing Wheel',
  },
  golden_titan: {
    rewardType: 'SQUAD_NIGHT',
    gamingMinutes: 60,
    validityDays: 10,
    eligibleStations: 'Standard gaming stations only',
    description: 'Squad Night: 1 Hour Gaming for You + 3 Friends',
  },
  platinum_sovereign: {
    rewardType: 'BRONZE_PASS',
    gamingMinutes: 600,
    validityDays: 14,
    eligibleStations: 'Standard gaming stations only',
    description: 'Bronze Pass (10 Hours)',
  },
};

const SLOT_FIELD: Record<ArmorySlot, 'headgearArtifactId' | 'armorArtifactId' | 'glovesArtifactId' | 'bootsArtifactId'> = {
  HEADGEAR: 'headgearArtifactId',
  ARMOR: 'armorArtifactId',
  GLOVES: 'glovesArtifactId',
  BOOTS: 'bootsArtifactId',
};

const ARMORY_RARITY_UPGRADE: Record<string, string> = {
  BRONZE: 'SILVER',
  SILVER: 'GOLD',
  GOLD: 'PLATINUM',
};

export function getArmoryToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function validateDropPercentages(sets: Array<{ active?: boolean; dropPercentage: number }>) {
  const total = sets
    .filter((set) => set.active !== false)
    .reduce((sum, set) => sum + Number(set.dropPercentage || 0), 0);
  return total === 100;
}

export function validateSlotWeights(artifacts: Array<{ active?: boolean; setId: string; slotDropPercentage?: number }>) {
  const totals = artifacts.reduce((map, artifact) => {
    if (artifact.active === false) return map;
    map[artifact.setId] = (map[artifact.setId] ?? 0) + Number(artifact.slotDropPercentage || 0);
    return map;
  }, {} as Record<string, number>);
  return Object.values(totals).every((total) => total === 100);
}

export function pickWeightedSet<T extends { dropPercentage: number }>(
  sets: T[],
  randomInt: RandomInt = crypto.randomInt,
): T {
  const total = sets.reduce((sum, set) => sum + set.dropPercentage, 0);
  const roll = randomInt(0, total);
  let cursor = 0;
  for (const set of sets) {
    cursor += set.dropPercentage;
    if (roll < cursor) return set;
  }
  return sets[0];
}

export function pickWeightedArtifact<T extends { slotDropPercentage: number }>(
  artifacts: T[],
  randomInt: RandomInt = crypto.randomInt,
): T {
  const total = artifacts.reduce((sum, artifact) => sum + artifact.slotDropPercentage, 0);
  const roll = randomInt(0, total);
  let cursor = 0;
  for (const artifact of artifacts) {
    cursor += artifact.slotDropPercentage;
    if (roll < cursor) return artifact;
  }
  return artifacts[0];
}

export function parseAdminArtifactGrantRequest(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('INVALID_GRANT_REQUEST');
  }

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 2
    || !keys.every((key) => key === 'userId' || key === 'setId')
    || typeof record.userId !== 'string'
    || typeof record.setId !== 'string'
  ) {
    throw new Error('INVALID_GRANT_REQUEST');
  }

  const userId = record.userId.trim();
  const setId = record.setId.trim();
  if (!userId || !setId) throw new Error('INVALID_GRANT_REQUEST');
  return { userId, setId };
}

export function pickAdminGrantArtifact<T extends { slotType: string }>(
  artifacts: T[],
  randomInt: RandomInt = crypto.randomInt,
): T {
  if (artifacts.length !== ARMORY_SLOTS.length) throw new Error('INCOMPLETE_SET');

  const weightedArtifacts = ADMIN_GRANT_SLOT_ORDER.map((slotType) => {
    const matches = artifacts.filter((artifact) => artifact.slotType === slotType);
    if (matches.length !== 1) throw new Error('INCOMPLETE_SET');
    return {
      artifact: matches[0],
      slotDropPercentage: ADMIN_GRANT_SLOT_WEIGHTS[slotType],
    };
  });

  return pickWeightedArtifact(weightedArtifacts, randomInt).artifact;
}

export function detectCompleteSet(loadout: Record<ArmorySlot, any | null>) {
  const equipped = ARMORY_SLOTS.map((slot) => loadout[slot]).filter(Boolean);
  if (equipped.length !== 4) return null;
  const setId = equipped[0].setId;
  return equipped.every((artifact) => artifact.setId === setId) ? setId : null;
}

function artifactId(setId: string, slot: ArmorySlot) {
  return `${setId}_${slot.toLowerCase()}`;
}

function nextIstMidnight() {
  const today = getArmoryToday();
  const tomorrow = addIsoDays(today, 1);
  return istDayStart(tomorrow);
}

function makeTicketCode() {
  return `ARM-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function getSettingsMap() {
  const settings = await prisma.setting.findMany({
    where: { key: { in: [...ARMORY_SETTING_KEYS] } },
  });
  return settings.reduce((map, setting) => ({ ...map, [setting.key]: setting.value }), {} as Record<string, string>);
}

async function getArmoryForgeConfig() {
  const now = Date.now();
  if (armoryForgeConfigCache && armoryForgeConfigCache.expiresAt > now) {
    return armoryForgeConfigCache;
  }

  await ensureArmoryDefaults();
  const [settings, sets] = await Promise.all([
    getSettingsMap(),
    prisma.armorySet.findMany({
      where: { active: true, dropPercentage: { gt: 0 }, artifacts: { some: { active: true, slotDropPercentage: { gt: 0 } } } },
      select: {
        id: true,
        dropPercentage: true,
        artifacts: {
          where: { active: true, slotDropPercentage: { gt: 0 } },
          select: {
            id: true,
            setId: true,
            slotType: true,
            name: true,
            active: true,
            slotDropPercentage: true,
            displayOrder: true,
            set: {
              select: {
                id: true,
                name: true,
                shortLabel: true,
                rarity: true,
                dropPercentage: true,
                active: true,
                displayOrder: true,
              },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: { displayOrder: 'asc' },
    }),
  ]);

  const config = {
    expiresAt: now + 30_000,
    enabled: settings.armory_enabled !== 'false',
    sets,
  };
  armoryForgeConfigCache = config;
  return config;
}

export async function ensureArmoryDefaults() {
  assertArmoryClientReady();
  if (armoryDefaultsReady) return;

  const [defaultsVersion, enabledSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: ARMORY_DEFAULTS_VERSION_KEY } }),
    prisma.setting.findUnique({ where: { key: 'armory_enabled' } }),
  ]);

  if (defaultsVersion?.value === ARMORY_DEFAULTS_VERSION && enabledSetting) {
    armoryDefaultsReady = true;
    return;
  }

  await prisma.setting.upsert({
    where: { key: 'armory_enabled' },
    update: {},
    create: { key: 'armory_enabled', value: 'true', label: 'Enable Artifacts' },
  });

  const shouldApplyLaunchDefaults = defaultsVersion?.value !== ARMORY_DEFAULTS_VERSION;

  for (const set of DEFAULT_ARMORY_SETS) {
    await prisma.armorySet.upsert({
      where: { id: set.id },
      update: shouldApplyLaunchDefaults ? {
        dropPercentage: set.dropPercentage,
        active: true,
        displayOrder: set.displayOrder,
      } : {},
      create: set,
    });

    for (const slot of ARMORY_SLOTS) {
      await prisma.armoryArtifact.upsert({
        where: { id: artifactId(set.id, slot) },
        update: shouldApplyLaunchDefaults ? {
          name: ARTIFACT_NAMES[set.id][slot],
          slotDropPercentage: DEFAULT_SLOT_WEIGHTS[slot],
        } : {},
        create: {
          id: artifactId(set.id, slot),
          setId: set.id,
          slotType: slot,
          name: ARTIFACT_NAMES[set.id][slot],
          slotDropPercentage: DEFAULT_SLOT_WEIGHTS[slot],
          displayOrder: ARMORY_SLOTS.indexOf(slot) + 1,
        },
      });
    }

    await prisma.armorySetReward.upsert({
      where: { setId: set.id },
      update: shouldApplyLaunchDefaults ? {
        ...DEFAULT_REWARDS[set.id],
        discountPercentage: DEFAULT_REWARDS[set.id].discountPercentage ?? null,
        discountAmount: DEFAULT_REWARDS[set.id].discountAmount ?? null,
        gamingMinutes: DEFAULT_REWARDS[set.id].gamingMinutes ?? null,
        racingMinutes: DEFAULT_REWARDS[set.id].racingMinutes ?? null,
        minimumBookingValue: DEFAULT_REWARDS[set.id].minimumBookingValue ?? null,
        maximumDiscount: DEFAULT_REWARDS[set.id].maximumDiscount ?? null,
        weekdayOnly: DEFAULT_REWARDS[set.id].weekdayOnly ?? false,
        active: true,
      } : {},
      create: {
        setId: set.id,
        ...DEFAULT_REWARDS[set.id],
        discountPercentage: DEFAULT_REWARDS[set.id].discountPercentage ?? null,
        discountAmount: DEFAULT_REWARDS[set.id].discountAmount ?? null,
        gamingMinutes: DEFAULT_REWARDS[set.id].gamingMinutes ?? null,
        racingMinutes: DEFAULT_REWARDS[set.id].racingMinutes ?? null,
        minimumBookingValue: DEFAULT_REWARDS[set.id].minimumBookingValue ?? null,
        maximumDiscount: DEFAULT_REWARDS[set.id].maximumDiscount ?? null,
        weekdayOnly: DEFAULT_REWARDS[set.id].weekdayOnly ?? false,
        active: true,
      },
    });
  }

  if (shouldApplyLaunchDefaults) {
    await prisma.setting.upsert({
      where: { key: ARMORY_DEFAULTS_VERSION_KEY },
      update: { value: ARMORY_DEFAULTS_VERSION },
      create: { key: ARMORY_DEFAULTS_VERSION_KEY, value: ARMORY_DEFAULTS_VERSION, label: 'Artifacts defaults version' },
    });
  }

  armoryDefaultsReady = true;
}

function assertArmoryClientReady() {
  if (!prisma.armorySet || !prisma.armoryArtifact || !prisma.armorySetReward) {
    throw new Error('ARMORY_PRISMA_CLIENT_STALE');
  }
}

function serializeArmorySet<T extends { dropPercentage?: number | null }>(set: T) {
  return {
    ...set,
    dropPercentage: encryptNumber(set.dropPercentage),
  };
}

function serializeArmoryArtifact<T extends { slotDropPercentage?: number | null; set?: any }>(artifact: T) {
  return {
    ...artifact,
    slotDropPercentage: encryptNumber(artifact.slotDropPercentage),
    ...(artifact.set ? { set: serializeArmorySet(artifact.set) } : {}),
  };
}

function serializeInventoryRow<T extends { artifact?: any }>(row: T) {
  return {
    ...row,
    ...(row.artifact ? { artifact: serializeArmoryArtifact(row.artifact) } : {}),
  };
}

function serializeLoadout(loadout: Record<string, any | null>) {
  return ARMORY_SLOTS.reduce((next, slot) => ({
    ...next,
    [slot]: loadout?.[slot] ? serializeArmoryArtifact(loadout[slot]) : null,
  }), {} as Record<ArmorySlot, any | null>);
}

export function serializeArmoryState(state: any) {
  return {
    ...state,
    sets: (state.sets ?? []).map((set: any) => ({
      ...serializeArmorySet(set),
      rewards: set.rewards ?? [],
    })),
    artifacts: (state.artifacts ?? []).map(serializeArmoryArtifact),
    inventory: (state.inventory ?? []).map(serializeInventoryRow),
    loadout: serializeLoadout(state.loadout ?? {}),
    forge: {
      ...state.forge,
      todayClaim: state.forge?.todayClaim
        ? {
          ...state.forge.todayClaim,
          artifact: state.forge.todayClaim.artifact
            ? serializeArmoryArtifact(state.forge.todayClaim.artifact)
            : state.forge.todayClaim.artifact,
        }
        : state.forge?.todayClaim,
    },
    progress: {
      ...state.progress,
      completeSet: state.progress?.completeSet ? serializeArmorySet(state.progress.completeSet) : state.progress?.completeSet,
    },
  };
}

export function serializeArmoryAdminConfig(config: any) {
  return {
    ...config,
    sets: (config.sets ?? []).map(serializeArmorySet),
    artifacts: (config.artifacts ?? []).map(serializeArmoryArtifact),
    rewards: (config.rewards ?? []).map((reward: any) => ({
      ...reward,
      set: reward.set ? serializeArmorySet(reward.set) : reward.set,
    })),
  };
}

export function serializeArmoryActionResult(result: any) {
  if (!result) return result;
  return {
    ...result,
    ...(result.selected ? { selected: serializeArmoryArtifact(result.selected) } : {}),
    ...(result.crafted ? { crafted: serializeArmoryArtifact(result.crafted) } : {}),
    ...(result.todayClaim?.artifact
      ? { todayClaim: { ...result.todayClaim, artifact: serializeArmoryArtifact(result.todayClaim.artifact) } }
      : {}),
    ...(result.ticket?.set ? { ticket: { ...result.ticket, set: serializeArmorySet(result.ticket.set) } } : {}),
  };
}

export async function getArmoryState(userId: string) {
  await Promise.all([
    ensureArmoryDefaults(),
    expireArmoryTradeListings({ sellerId: userId }),
  ]);
  const today = getArmoryToday();
  const [settings, user, sets, artifacts, inventory, loadout, todayClaim, tickets] = await Promise.all([
    getSettingsMap(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { guildGems: true },
    }),
    prisma.armorySet.findMany({ include: { rewards: true }, orderBy: { displayOrder: 'asc' } }),
    prisma.armoryArtifact.findMany({ include: { set: true }, orderBy: [{ set: { displayOrder: 'asc' } }, { displayOrder: 'asc' }] }),
    prisma.armoryInventory.findMany({
      where: { userId, quantity: { gt: 0 } },
      include: { artifact: { include: { set: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.armoryLoadout.findUnique({
      where: { userId },
      include: {
        headgear: { include: { set: true } },
        armor: { include: { set: true } },
        gloves: { include: { set: true } },
        boots: { include: { set: true } },
      },
    }),
    prisma.armoryDailyClaim.findUnique({
      where: { userId_claimDate: { userId, claimDate: today } },
      include: { artifact: { include: { set: true } } },
    }),
    prisma.armoryTicket.findMany({
      where: { userId, claimDate: today },
      select: {
        id: true,
        setId: true,
        rewardSnapshot: true,
        code: true,
        set: { select: { id: true, name: true, rarity: true } },
      },
      orderBy: { id: 'desc' },
      take: 20,
    }),
  ]);

  const enabled = settings.armory_enabled !== 'false';
  const equipped = {
    HEADGEAR: loadout?.headgear ?? null,
    ARMOR: loadout?.armor ?? null,
    GLOVES: loadout?.gloves ?? null,
    BOOTS: loadout?.boots ?? null,
  };
  const completeSetId = detectCompleteSet(equipped);
  const completeSet = completeSetId ? sets.find((set) => set.id === completeSetId) ?? null : null;

  return {
    today,
    guildGems: user?.guildGems ?? 0,
    forge: {
      enabled,
      canForge: enabled && !todayClaim,
      claimedToday: Boolean(todayClaim),
      todayClaim,
      reason: !enabled ? 'disabled' : todayClaim ? 'claimed' : 'ready',
    },
    sets,
    artifacts,
    inventory,
    loadout: equipped,
    progress: {
      completeSet,
      reward: completeSet?.rewards?.[0] ?? null,
    },
    tickets,
  };
}

export async function forgeArtifact(userId: string) {
  const today = getArmoryToday();
  const config = await getArmoryForgeConfig();
  if (!config.enabled) throw new Error('ARMORY_DISABLED');
  if (!config.sets.length) throw new Error('NO_ARTIFACTS');
  if (!validateDropPercentages(config.sets)) throw new Error('BAD_DROP_TOTAL');
  if (!validateSlotWeights(config.sets.flatMap((set) => set.artifacts))) throw new Error('BAD_SLOT_TOTAL');

  const set = pickWeightedSet(config.sets);
  const selected = pickWeightedArtifact(set.artifacts);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.armoryDailyClaim.findUnique({
      where: { userId_claimDate: { userId, claimDate: today } },
    });
    if (existing) throw new Error('ALREADY_FORGED');

    await tx.armoryInventory.upsert({
      where: { userId_artifactId: { userId, artifactId: selected.id } },
      update: { quantity: { increment: 1 } },
      create: { userId, artifactId: selected.id, quantity: 1 },
    });
    await tx.armoryDailyClaim.create({
      data: { userId, claimDate: today, artifactId: selected.id },
    });
  });

  return {
    selected,
    todayClaim: {
      userId,
      claimDate: today,
      artifactId: selected.id,
      artifact: selected,
    },
  };
}

export async function grantAdminArmoryArtifact(userId: string, setId: string) {
  await ensureArmoryDefaults();

  return prisma.$transaction(async (tx) => {
    const [user, set] = await Promise.all([
      tx.user.findFirst({
        where: { id: userId, role: 'USER' },
        select: { id: true, name: true, email: true },
      }),
      tx.armorySet.findFirst({
        where: { id: setId, active: true },
        select: {
          id: true,
          name: true,
          rarity: true,
          artifacts: {
            where: { active: true },
            select: { id: true, setId: true, name: true, slotType: true },
          },
        },
      }),
    ]);

    if (!user) throw new Error('USER_NOT_FOUND');
    if (!set || !ADMIN_GRANT_RARITIES.has(set.rarity)) throw new Error('SET_NOT_AVAILABLE');

    const selected = pickAdminGrantArtifact(set.artifacts);
    const grantToken = crypto.randomUUID();

    await tx.armoryInventory.upsert({
      where: { userId_artifactId: { userId, artifactId: selected.id } },
      update: { quantity: { increment: 1 } },
      create: { userId, artifactId: selected.id, quantity: 1 },
    });
    const claim = await tx.armoryDailyClaim.create({
      data: {
        id: `admin_${grantToken}`,
        userId,
        claimDate: `${getArmoryToday()}:admin:${grantToken}`,
        artifactId: selected.id,
      },
      select: { id: true, claimDate: true, createdAt: true },
    });

    return {
      ...claim,
      source: 'ADMIN_GRANT' as const,
      user,
      artifact: {
        id: selected.id,
        name: selected.name,
        slotType: selected.slotType,
        set: { id: set.id, name: set.name, rarity: set.rarity },
      },
    };
  });
}

type CheckInArtifact = {
  id: string;
  name: string;
  slotType: string;
  set: { id: string; name: string; rarity: string };
};

export type CheckInArtifactAward = {
  awarded: boolean;
  reason?: 'NO_USER_ACCOUNT' | 'ARMORY_DISABLED' | 'ALREADY_AWARDED' | 'ALREADY_CHECKED_IN';
  artifact?: CheckInArtifact;
};

function checkInArtifactPayload(artifact: any): CheckInArtifact {
  return {
    id: artifact.id,
    name: artifact.name,
    slotType: artifact.slotType,
    set: {
      id: artifact.set.id,
      name: artifact.set.name,
      rarity: artifact.set.rarity,
    },
  };
}

const checkInBookingInclude = {
  user: { select: { id: true, name: true, email: true } },
  station: { select: { id: true, name: true } },
} as const;

export async function checkInBookingWithArtifact(bookingId: string) {
  const claimId = `checkin_${bookingId}`;
  const [booking, existingClaim] = await Promise.all([
    prisma.booking.findUnique({ where: { id: bookingId }, include: checkInBookingInclude }),
    prisma.armoryDailyClaim.findUnique({
      where: { id: claimId },
      include: { artifact: { include: { set: true } } },
    }),
  ]);
  if (!booking) throw new Error('BOOKING_NOT_FOUND');

  if (existingClaim) {
    const updatedBooking = booking.status === 'CHECKED_IN'
      ? booking
      : await prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'CHECKED_IN' },
        include: checkInBookingInclude,
      });
    return {
      booking: updatedBooking,
      artifactAward: {
        awarded: false,
        reason: 'ALREADY_AWARDED',
        artifact: checkInArtifactPayload(existingClaim.artifact),
      } satisfies CheckInArtifactAward,
    };
  }

  if (booking.status === 'CHECKED_IN') {
    return {
      booking,
      artifactAward: { awarded: false, reason: 'ALREADY_CHECKED_IN' } satisfies CheckInArtifactAward,
    };
  }

  if (!booking.userId) {
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CHECKED_IN' },
      include: checkInBookingInclude,
    });
    return {
      booking: updatedBooking,
      artifactAward: { awarded: false, reason: 'NO_USER_ACCOUNT' } satisfies CheckInArtifactAward,
    };
  }

  const config = await getArmoryForgeConfig();
  if (!config.enabled) {
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CHECKED_IN' },
      include: checkInBookingInclude,
    });
    return {
      booking: updatedBooking,
      artifactAward: { awarded: false, reason: 'ARMORY_DISABLED' } satisfies CheckInArtifactAward,
    };
  }
  if (!config.sets.length) throw new Error('NO_ARTIFACTS');
  if (!validateDropPercentages(config.sets)) throw new Error('BAD_DROP_TOTAL');
  if (!validateSlotWeights(config.sets.flatMap((set) => set.artifacts))) throw new Error('BAD_SLOT_TOTAL');

  const selectedSet = pickWeightedSet(config.sets);
  const selected = pickWeightedArtifact(selectedSet.artifacts);

  try {
    const updatedBooking = await prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CHECKED_IN' },
        include: checkInBookingInclude,
      });
      await tx.armoryInventory.upsert({
        where: { userId_artifactId: { userId: booking.userId!, artifactId: selected.id } },
        update: { quantity: { increment: 1 } },
        create: { userId: booking.userId!, artifactId: selected.id, quantity: 1 },
      });
      await tx.armoryDailyClaim.create({
        data: {
          id: claimId,
          userId: booking.userId!,
          claimDate: `${getArmoryToday()}:checkin:${bookingId}`,
          artifactId: selected.id,
        },
      });
      return updated;
    });

    return {
      booking: updatedBooking,
      artifactAward: {
        awarded: true,
        artifact: checkInArtifactPayload(selected),
      } satisfies CheckInArtifactAward,
    };
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error;
    const [currentBooking, claim] = await Promise.all([
      prisma.booking.findUnique({ where: { id: bookingId }, include: checkInBookingInclude }),
      prisma.armoryDailyClaim.findUnique({
        where: { id: claimId },
        include: { artifact: { include: { set: true } } },
      }),
    ]);
    if (!currentBooking || !claim) throw error;
    return {
      booking: currentBooking,
      artifactAward: {
        awarded: false,
        reason: 'ALREADY_AWARDED',
        artifact: checkInArtifactPayload(claim.artifact),
      } satisfies CheckInArtifactAward,
    };
  }
}

export async function equipArtifact(userId: string, slotType: string, artifactIdValue?: string | null) {
  if (!ARMORY_SLOTS.includes(slotType as ArmorySlot)) throw new Error('BAD_SLOT');
  const slot = slotType as ArmorySlot;
  const field = SLOT_FIELD[slot];

  if (!artifactIdValue) {
    await prisma.armoryLoadout.updateMany({ where: { userId }, data: { [field]: null } });
    return { slotType: slot, artifactId: null };
  }

  const [inventory, loadout] = await Promise.all([
    prisma.armoryInventory.findUnique({
      where: { userId_artifactId: { userId, artifactId: artifactIdValue } },
      select: {
        quantity: true,
        artifact: { select: { slotType: true } },
      },
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
  ]);

  if (!inventory || inventory.quantity <= 0) throw new Error('NOT_OWNED');
  if (inventory.artifact.slotType !== slot) throw new Error('BAD_ARTIFACT');

  const equippedIds = [
    loadout?.headgearArtifactId,
    loadout?.armorArtifactId,
    loadout?.glovesArtifactId,
    loadout?.bootsArtifactId,
  ].filter(Boolean);
  const alreadyEquippedCopies = equippedIds.filter((id) => id === artifactIdValue).length;
  if (inventory.quantity <= alreadyEquippedCopies && loadout?.[field] !== artifactIdValue) {
    throw new Error('NO_FREE_COPY');
  }

  await prisma.armoryLoadout.upsert({
    where: { userId },
    update: { [field]: artifactIdValue },
    create: { userId, [field]: artifactIdValue },
  });

  return { slotType: slot, artifactId: artifactIdValue ?? null };
}

export async function craftArmoryArtifact(userId: string, artifactIdValue: string) {
  const config = await getArmoryForgeConfig();
  const artifacts = config.sets.flatMap((set) => set.artifacts);
  const artifact = artifacts.find((item) => item.id === artifactIdValue);
  if (!artifact || !artifact.active) throw new Error('BAD_ARTIFACT');

  const nextRarity = ARMORY_RARITY_UPGRADE[artifact.set.rarity];
  if (!nextRarity) throw new Error('NO_CRAFT_UPGRADE');

  const nextArtifact = artifacts.find((item) => item.slotType === artifact.slotType && item.set.rarity === nextRarity);
  if (!nextArtifact) throw new Error('NO_CRAFT_TARGET');

  const [inventory, loadout] = await Promise.all([
    prisma.armoryInventory.findUnique({
      where: { userId_artifactId: { userId, artifactId: artifact.id } },
      select: { quantity: true },
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
  ]);
  if (!inventory || inventory.quantity < 3) throw new Error('NOT_ENOUGH_DUPLICATES');

  const equippedIds = [
    loadout?.headgearArtifactId,
    loadout?.armorArtifactId,
    loadout?.glovesArtifactId,
    loadout?.bootsArtifactId,
  ].filter(Boolean);
  const equippedCopies = equippedIds.filter((id) => id === artifact.id).length;
  if (inventory.quantity - equippedCopies < 3) throw new Error('NO_FREE_CRAFT_COPIES');

  const requiredQuantity = 3 + equippedCopies;
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.armoryInventory.updateMany({
      where: { userId, artifactId: artifact.id, quantity: { gte: requiredQuantity } },
      data: { quantity: { decrement: 3 } },
    });
    if (consumed.count !== 1) throw new Error('NO_FREE_CRAFT_COPIES');
    await tx.armoryInventory.upsert({
      where: { userId_artifactId: { userId, artifactId: nextArtifact.id } },
      update: { quantity: { increment: 1 } },
      create: { userId, artifactId: nextArtifact.id, quantity: 1 },
    });
  });

  return { crafted: nextArtifact, consumedArtifactId: artifactIdValue, consumedQuantity: 3 };
}

export async function claimArmorySet(userId: string) {
  const claimDate = getArmoryToday();
  const ticket = await prisma.$transaction(async (tx) => {
    const loadout = await tx.armoryLoadout.findUnique({
      where: { userId },
      include: {
        headgear: { select: { id: true, setId: true } },
        armor: { select: { id: true, setId: true } },
        gloves: { select: { id: true, setId: true } },
        boots: { select: { id: true, setId: true } },
      },
    });
    if (!loadout?.headgear || !loadout.armor || !loadout.gloves || !loadout.boots) throw new Error('NO_FULL_SET');

    const equipped = {
      HEADGEAR: loadout.headgear,
      ARMOR: loadout.armor,
      GLOVES: loadout.gloves,
      BOOTS: loadout.boots,
    };
    const setId = detectCompleteSet(equipped);
    if (!setId) throw new Error('NO_MATCHING_SET');

    const reward = await tx.armorySetReward.findUnique({ where: { setId }, include: { set: true } });
    if (!reward || !reward.active) throw new Error('REWARD_INACTIVE');

    const artifactIds = [loadout.headgear.id, loadout.armor.id, loadout.gloves.id, loadout.boots.id];
    for (const id of artifactIds) {
      const consumed = await tx.armoryInventory.updateMany({
        where: { userId, artifactId: id, quantity: { gt: 0 } },
        data: { quantity: { decrement: 1 } },
      });
      if (consumed.count !== 1) throw new Error('MISSING_EQUIPPED_ITEM');
    }

    await tx.armoryLoadout.update({
      where: { userId },
      data: {
        headgearArtifactId: null,
        armorArtifactId: null,
        glovesArtifactId: null,
        bootsArtifactId: null,
      },
    });

    const expiresAt = nextIstMidnight();
    const ticket = await tx.armoryTicket.create({
      data: {
        userId,
        setId,
        code: makeTicketCode(),
        claimDate,
        rewardSnapshot: JSON.stringify({
          setName: reward.set.name,
          setRarity: reward.set.rarity,
          rewardType: reward.rewardType,
          discountPercentage: reward.discountPercentage,
          discountAmount: reward.discountAmount,
          gamingMinutes: reward.gamingMinutes,
          racingMinutes: reward.racingMinutes,
          validityDays: reward.validityDays,
          minimumBookingValue: reward.minimumBookingValue,
          eligibleStations: reward.eligibleStations,
          weekdayOnly: reward.weekdayOnly,
          maximumDiscount: reward.maximumDiscount,
          description: reward.description,
        }),
        expiresAt,
      },
      include: { set: true },
    });

    const user = await tx.user.update({
      where: { id: userId },
      data: { guildGems: { increment: 1 } },
      select: { guildGems: true },
    });
    await tx.guildGemLedger.create({
      data: {
        userId,
        amount: 1,
        balanceAfter: user.guildGems,
        reason: 'SET_CONSUMED',
        referenceId: ticket.id,
      },
    });

    return {
      ticket,
      consumedArtifactIds: artifactIds,
      gemsEarned: 1,
      guildGems: user.guildGems,
    };
  });

  return ticket;
}

export async function getArmoryAdminConfig() {
  await ensureArmoryDefaults();
  const [settings, sets, artifacts, rewards] = await Promise.all([
    getSettingsMap(),
    prisma.armorySet.findMany({ orderBy: { displayOrder: 'asc' } }),
    prisma.armoryArtifact.findMany({ include: { set: true }, orderBy: [{ set: { displayOrder: 'asc' } }, { displayOrder: 'asc' }] }),
    prisma.armorySetReward.findMany({ include: { set: true }, orderBy: { set: { displayOrder: 'asc' } } }),
  ]);
  return { settings, sets, artifacts, rewards };
}

export async function updateArmoryAdminConfig(body: any) {
  await ensureArmoryDefaults();
  const sets = Array.isArray(body.sets) ? body.sets : [];
  if (!validateDropPercentages(sets)) throw new Error('BAD_DROP_TOTAL');
  const artifacts = Array.isArray(body.artifacts) ? body.artifacts : [];
  if (!validateSlotWeights(artifacts)) throw new Error('BAD_SLOT_TOTAL');

  await prisma.$transaction(async (tx) => {
    const settings = body.settings ?? {};
    for (const key of ARMORY_SETTING_KEYS) {
      if (settings[key] !== undefined) {
        await tx.setting.upsert({
          where: { key },
          update: { value: String(settings[key] ?? '') },
          create: { key, value: String(settings[key] ?? ''), label: key },
        });
      }
    }

    for (const set of sets) {
      await tx.armorySet.update({
        where: { id: set.id },
        data: {
          dropPercentage: Number(set.dropPercentage ?? 0),
          active: Boolean(set.active),
        },
      });
    }

    for (const artifact of artifacts) {
      await tx.armoryArtifact.update({
        where: { id: artifact.id },
        data: {
          active: Boolean(artifact.active),
          slotDropPercentage: Math.max(0, Number(artifact.slotDropPercentage ?? 0)),
        },
      });
    }

    for (const reward of Array.isArray(body.rewards) ? body.rewards : []) {
      await tx.armorySetReward.update({
        where: { setId: reward.setId },
        data: {
          rewardType: String(reward.rewardType || 'PERCENT_DISCOUNT'),
          discountPercentage: nullableInt(reward.discountPercentage),
          discountAmount: nullableInt(reward.discountAmount),
          gamingMinutes: nullableInt(reward.gamingMinutes),
          racingMinutes: nullableInt(reward.racingMinutes),
          validityDays: Math.max(1, Number(reward.validityDays || 7)),
          minimumBookingValue: nullableInt(reward.minimumBookingValue),
          eligibleStations: reward.eligibleStations ? String(reward.eligibleStations) : null,
          weekdayOnly: Boolean(reward.weekdayOnly),
          maximumDiscount: nullableInt(reward.maximumDiscount),
          active: Boolean(reward.active),
          description: String(reward.description || 'Armory reward ticket'),
        },
      });
    }
  });

  armoryForgeConfigCache = null;
  return getArmoryAdminConfig();
}

export async function getArmoryConsumedSets(date?: string) {
  const claimDate = date || getArmoryToday();
  return prisma.armoryTicket.findMany({
    where: {
      claimDate,
    },
    select: {
      id: true,
      rewardSnapshot: true,
      claimedAt: true,
      user: { select: { name: true, email: true, phone: true } },
      set: { select: { name: true } },
    },
    orderBy: { claimedAt: 'desc' },
    take: 200,
  });
}

export async function getArmoryDailyDrops(date?: string) {
  const claimDate = date || getArmoryToday();
  return prisma.armoryDailyClaim.findMany({
    where: { claimDate: { startsWith: claimDate } },
    select: {
      id: true,
      claimDate: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      artifact: {
        select: {
          name: true,
          slotType: true,
          set: { select: { name: true, rarity: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function searchArmoryInventoryUsers(search: string) {
  const query = search.trim();
  if (query.length < 2) return [];

  return prisma.user.findMany({
    where: {
      role: 'USER',
      OR: [
        { name: { contains: query } },
        { email: { contains: query } },
      ],
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
    take: 12,
  });
}

export async function getArmoryUserInventory(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      armoryInventory: {
        where: { quantity: { gt: 0 } },
        select: {
          id: true,
          quantity: true,
          artifact: {
            select: {
              id: true,
              name: true,
              slotType: true,
              set: { select: { name: true, rarity: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });
}

function nullableInt(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function lookupArmoryTicket(code: string) {
  return prisma.armoryTicket.findUnique({
    where: { code: code.trim().toUpperCase() },
    select: {
      id: true,
      rewardSnapshot: true,
      code: true,
      status: true,
      claimDate: true,
      claimedAt: true,
      expiresAt: true,
      redeemedAt: true,
      user: { select: { name: true, email: true, phone: true } },
      set: { select: { id: true, name: true, rarity: true } },
    },
  });
}

export async function redeemArmoryTicket(ticketId: string) {
  const ticket = await prisma.armoryTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, claimDate: true, expiresAt: true },
  });
  if (!ticket) throw new Error('TICKET_NOT_FOUND');
  if (ticket.status === 'REDEEMED') throw new Error('TICKET_REDEEMED');
  if (ticket.claimDate !== getArmoryToday()) throw new Error('TICKET_EXPIRED');
  return prisma.armoryTicket.update({
    where: { id: ticketId },
    data: { status: 'REDEEMED', redeemedAt: new Date() },
    select: {
      id: true,
      rewardSnapshot: true,
      code: true,
      status: true,
      claimDate: true,
      claimedAt: true,
      expiresAt: true,
      redeemedAt: true,
      user: { select: { name: true, email: true, phone: true } },
      set: { select: { id: true, name: true, rarity: true } },
    },
  });
}

export function friendlyArmoryError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  const map: Record<string, { error: string; status: number }> = {
    ARMORY_DISABLED: { error: 'The Armory is closed right now.', status: 403 },
    BOOKING_NOT_FOUND: { error: 'Booking not found.', status: 404 },
    ARMORY_PRISMA_CLIENT_STALE: { error: 'Artifacts needs a dev server restart after Prisma generation.', status: 500 },
    ALREADY_FORGED: { error: 'You already forged an artifact today.', status: 429 },
    BAD_DROP_TOTAL: { error: 'Active drop percentages must total 100%.', status: 400 },
    BAD_SLOT_TOTAL: { error: 'Active slot weights inside each set must total 100%.', status: 400 },
    NO_ARTIFACTS: { error: 'No artifacts are available right now.', status: 500 },
    BAD_SLOT: { error: 'Invalid equipment slot.', status: 400 },
    BAD_ARTIFACT: { error: 'That artifact cannot be equipped in this slot.', status: 400 },
    NOT_OWNED: { error: 'You do not own this artifact.', status: 400 },
    NO_FREE_COPY: { error: 'No free copy of this artifact is available.', status: 400 },
    NO_CRAFT_UPGRADE: { error: 'This artifact cannot be crafted higher.', status: 400 },
    NO_CRAFT_TARGET: { error: 'No matching higher artifact is available.', status: 400 },
    NOT_ENOUGH_DUPLICATES: { error: 'You need 3 copies of the same artifact to craft.', status: 400 },
    NO_FREE_CRAFT_COPIES: { error: 'Unequip this artifact or collect more copies before crafting.', status: 400 },
    NO_FULL_SET: { error: 'Equip all four slots before claiming a set reward.', status: 400 },
    NO_MATCHING_SET: { error: 'All four equipped artifacts must belong to the same set.', status: 400 },
    REWARD_INACTIVE: { error: 'This set reward is inactive.', status: 400 },
    MISSING_EQUIPPED_ITEM: { error: 'One equipped artifact is no longer in your inventory.', status: 400 },
    TICKET_NOT_FOUND: { error: 'Ticket not found.', status: 404 },
    TICKET_REDEEMED: { error: 'Ticket has already been redeemed.', status: 409 },
    TICKET_EXPIRED: { error: 'Ticket has expired.', status: 410 },
  };
  return map[code] ?? { error: 'Armory action failed.', status: 500 };
}

function istDayStart(date: string) {
  return new Date(`${date}T00:00:00+05:30`);
}

function addIsoDays(date: string, days: number) {
  const start = istDayStart(date);
  start.setUTCDate(start.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(start);
}
