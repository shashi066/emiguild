export const GUILD_MEMBERSHIP_TYPES = ['GUILD_HERO', 'GUILD_MASTER'] as const;
export type GuildMembershipType = (typeof GUILD_MEMBERSHIP_TYPES)[number];

export type GuildMembershipPlan = {
  type: GuildMembershipType;
  name: string;
  tagline: string;
  audience: string;
  price: number;
  validityDays: number;
  description: string;
  isActive: boolean;
  soloDiscountPercentage: number;
  squadDiscountPercentage: number;
};

export const DEFAULT_GUILD_MEMBERSHIP_PLANS: Record<GuildMembershipType, GuildMembershipPlan> = {
  GUILD_HERO: {
    type: 'GUILD_HERO',
    name: 'Guild Hero',
    tagline: 'Solo gaming at half price.',
    audience: 'Made for solo players',
    price: 499,
    validityDays: 30,
    description: '50% OFF eligible solo PS5 bookings every day.',
    isActive: true,
    soloDiscountPercentage: 50,
    squadDiscountPercentage: 0,
  },
  GUILD_MASTER: {
    type: 'GUILD_MASTER',
    name: 'Guild Master',
    tagline: 'Bring the squad. Everyone plays for less.',
    audience: 'Best for squads',
    price: 999,
    validityDays: 30,
    description: '50% OFF eligible solo and squad PS5 bookings every day.',
    isActive: true,
    soloDiscountPercentage: 50,
    squadDiscountPercentage: 50,
  },
};

const LEGACY_WEEKDAY_DESCRIPTIONS: Record<GuildMembershipType, string> = {
  GUILD_HERO: '50% OFF eligible solo weekday PS5 bookings.',
  GUILD_MASTER: '50% OFF eligible solo and squad weekday PS5 bookings.',
};

export type GuildMembershipRecord = {
  id: string;
  passType: string;
  status: string;
  purchasedAt: Date | string;
  expiresAt: Date | string;
};

export type GuildEligibility = {
  eligible: boolean;
  code:
    | 'ELIGIBLE'
    | 'NO_MEMBERSHIP'
    | 'INACTIVE'
    | 'OUTSIDE_COVERAGE'
    | 'RACING'
    | 'HERO_SQUAD';
  reason: string;
};

export type GuildBenefitApplicationValidation =
  | {
      valid: true;
      benefitType: GuildMembershipType;
      reason: string;
    }
  | {
      valid: false;
      code:
        | GuildEligibility['code']
        | 'INVALID_BENEFIT'
        | 'NO_LINKED_USER'
        | 'BENEFIT_STACKING'
        | 'INVALID_DISCOUNT';
      reason: string;
    };

export function isGuildMembershipType(value: unknown): value is GuildMembershipType {
  return typeof value === 'string'
    && GUILD_MEMBERSHIP_TYPES.includes(value as GuildMembershipType);
}

export function getGuildMembershipPlan(
  plans: GuildMembershipPlan[],
  type: GuildMembershipType,
) {
  return plans.find((plan) => plan.type === type)
    ?? DEFAULT_GUILD_MEMBERSHIP_PLANS[type];
}

export function normalizeGuildMembershipPlans(raw: unknown): GuildMembershipPlan[] {
  const source = raw && typeof raw === 'object'
    ? raw as Record<string, Record<string, unknown>>
    : {};

  return GUILD_MEMBERSHIP_TYPES.map((type) => {
    const defaults = DEFAULT_GUILD_MEMBERSHIP_PLANS[type];
    const configured = source[type] ?? {};
    const price = Number(configured.price);
    const validityDays = Number(configured.validityDays);
    const description = typeof configured.description === 'string'
      ? configured.description.trim()
      : '';

    return {
      ...defaults,
      price: Number.isInteger(price) && price > 0 ? price : defaults.price,
      validityDays: Number.isInteger(validityDays) && validityDays > 0
        ? validityDays
        : defaults.validityDays,
      description: !description || description === LEGACY_WEEKDAY_DESCRIPTIONS[type]
        ? defaults.description
        : description,
      isActive: typeof configured.isActive === 'boolean'
        ? configured.isActive
        : defaults.isActive,
    };
  });
}

export function isGuildMembershipActive(
  membership: GuildMembershipRecord,
  now = new Date(),
) {
  return isGuildMembershipType(membership.passType)
    && membership.status === 'ACTIVE'
    && new Date(membership.expiresAt).getTime() >= now.getTime();
}

export function selectPreferredGuildMembership<T extends GuildMembershipRecord>(
  memberships: T[],
  now = new Date(),
): T | null {
  return memberships
    .filter((membership) => isGuildMembershipActive(membership, now))
    .sort((left, right) => {
      const rankDifference = Number(right.passType === 'GUILD_MASTER')
        - Number(left.passType === 'GUILD_MASTER');
      if (rankDifference !== 0) return rankDifference;
      return new Date(right.expiresAt).getTime() - new Date(left.expiresAt).getTime();
    })[0] ?? null;
}

function toIstDateString(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function getGuildMembershipEligibility({
  membership,
  bookingDate,
  hasControllers,
  extraControllers,
  now = new Date(),
}: {
  membership: GuildMembershipRecord | null;
  bookingDate: string;
  hasControllers: boolean;
  extraControllers: number;
  now?: Date;
}): GuildEligibility {
  if (!membership || !isGuildMembershipType(membership.passType)) {
    return { eligible: false, code: 'NO_MEMBERSHIP', reason: 'No active Guild Membership found.' };
  }
  if (!isGuildMembershipActive(membership, now)) {
    return { eligible: false, code: 'INACTIVE', reason: 'This Guild Membership is not active.' };
  }

  const coverageStart = toIstDateString(membership.purchasedAt);
  const coverageEnd = toIstDateString(membership.expiresAt);
  if (!coverageStart || !coverageEnd || bookingDate < coverageStart || bookingDate > coverageEnd) {
    return {
      eligible: false,
      code: 'OUTSIDE_COVERAGE',
      reason: 'The selected booking date is outside the membership period.',
    };
  }
  if (!hasControllers) {
    return {
      eligible: false,
      code: 'RACING',
      reason: 'Guild Membership benefits are not available for Racing Simulators.',
    };
  }
  if (membership.passType === 'GUILD_HERO' && extraControllers > 0) {
    return {
      eligible: false,
      code: 'HERO_SQUAD',
      reason: 'Guild Hero covers solo PS5 bookings only.',
    };
  }

  return {
    eligible: true,
    code: 'ELIGIBLE',
    reason: membership.passType === 'GUILD_MASTER'
      ? 'Eligible for the Guild Master solo or squad discount.'
      : 'Eligible for the Guild Hero solo discount.',
  };
}

export function validateGuildBenefitApplication({
  requestedBenefit,
  membership,
  bookingDate,
  hasControllers,
  extraControllers,
  discount,
  hasLinkedUser,
  hasHourPass,
  now = new Date(),
}: {
  requestedBenefit: unknown;
  membership: GuildMembershipRecord | null;
  bookingDate: string;
  hasControllers: boolean;
  extraControllers: number;
  discount: number;
  hasLinkedUser: boolean;
  hasHourPass: boolean;
  now?: Date;
}): GuildBenefitApplicationValidation {
  if (!isGuildMembershipType(requestedBenefit)) {
    return {
      valid: false,
      code: 'INVALID_BENEFIT',
      reason: 'Invalid applied benefit.',
    };
  }
  if (!hasLinkedUser) {
    return {
      valid: false,
      code: 'NO_LINKED_USER',
      reason: 'Guild Membership requires a linked user.',
    };
  }
  if (hasHourPass) {
    return {
      valid: false,
      code: 'BENEFIT_STACKING',
      reason: 'A Guild Membership cannot be combined with an hour pass or another offer.',
    };
  }
  if (discount !== 50) {
    return {
      valid: false,
      code: 'INVALID_DISCOUNT',
      reason: 'Guild Membership requires exactly 50% discount.',
    };
  }
  if (!membership || membership.passType !== requestedBenefit) {
    return {
      valid: false,
      code: 'NO_MEMBERSHIP',
      reason: 'No active Guild Membership found.',
    };
  }

  const eligibility = getGuildMembershipEligibility({
    membership,
    bookingDate,
    hasControllers,
    extraControllers,
    now,
  });
  if (!eligibility.eligible) {
    return {
      valid: false,
      code: eligibility.code,
      reason: eligibility.reason,
    };
  }

  return {
    valid: true,
    benefitType: requestedBenefit,
    reason: eligibility.reason,
  };
}

export function guildMembershipName(type: string) {
  return isGuildMembershipType(type)
    ? DEFAULT_GUILD_MEMBERSHIP_PLANS[type].name
    : type;
}
