import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GUILD_MEMBERSHIP_PLANS,
  getGuildMembershipEligibility,
  isGuildMembershipActive,
  isGuildMembershipType,
  normalizeGuildMembershipPlans,
  selectPreferredGuildMembership,
  validateGuildBenefitApplication,
} from '../../lib/guild-membership';

const now = new Date('2026-07-28T06:30:00.000Z');

function membership(passType: 'GUILD_HERO' | 'GUILD_MASTER', overrides = {}) {
  return {
    id: passType,
    passType,
    status: 'ACTIVE',
    purchasedAt: '2026-07-27T06:30:00.000Z',
    expiresAt: '2026-08-26T06:30:00.000Z',
    ...overrides,
  };
}

function rejectionCode(
  input: Parameters<typeof validateGuildBenefitApplication>[0],
) {
  const result = validateGuildBenefitApplication(input);
  assert.equal(result.valid, false);
  return result.valid ? 'VALID' : result.code;
}

test('keeps the required Guild plan defaults', () => {
  assert.equal(DEFAULT_GUILD_MEMBERSHIP_PLANS.GUILD_HERO.price, 499);
  assert.equal(DEFAULT_GUILD_MEMBERSHIP_PLANS.GUILD_MASTER.price, 999);
  assert.equal(DEFAULT_GUILD_MEMBERSHIP_PLANS.GUILD_HERO.validityDays, 30);
  assert.equal(DEFAULT_GUILD_MEMBERSHIP_PLANS.GUILD_MASTER.validityDays, 30);
});

test('normalizes editable settings without changing fixed discount rules', () => {
  const plans = normalizeGuildMembershipPlans({
    GUILD_HERO: {
      price: 549,
      validityDays: 45,
      description: 'Updated Hero benefit.',
      isActive: false,
      soloDiscountPercentage: 80,
    },
  });
  const hero = plans.find((plan) => plan.type === 'GUILD_HERO')!;

  assert.equal(hero.price, 549);
  assert.equal(hero.validityDays, 45);
  assert.equal(hero.description, 'Updated Hero benefit.');
  assert.equal(hero.isActive, false);
  assert.equal(hero.soloDiscountPercentage, 50);
});

test('replaces stored weekday default copy with the current every-day offer', () => {
  const plans = normalizeGuildMembershipPlans({
    GUILD_HERO: {
      description: '50% OFF eligible solo weekday PS5 bookings.',
    },
    GUILD_MASTER: {
      description: '50% OFF eligible solo and squad weekday PS5 bookings.',
    },
  });

  assert.equal(
    plans.find((plan) => plan.type === 'GUILD_HERO')?.description,
    DEFAULT_GUILD_MEMBERSHIP_PLANS.GUILD_HERO.description,
  );
  assert.equal(
    plans.find((plan) => plan.type === 'GUILD_MASTER')?.description,
    DEFAULT_GUILD_MEMBERSHIP_PLANS.GUILD_MASTER.description,
  );
});

test('preserves disabled plans while keeping required defaults valid', () => {
  const plans = normalizeGuildMembershipPlans({
    GUILD_MASTER: {
      isActive: false,
      price: -1,
      validityDays: 0,
      description: '',
    },
  });
  const master = plans.find((plan) => plan.type === 'GUILD_MASTER')!;

  assert.equal(master.isActive, false);
  assert.equal(master.price, 999);
  assert.equal(master.validityDays, 30);
  assert.equal(master.description, DEFAULT_GUILD_MEMBERSHIP_PLANS.GUILD_MASTER.description);
});

test('allows Hero for solo PS5 bookings every day', () => {
  const hero = membership('GUILD_HERO');

  for (const bookingDate of ['2026-07-28', '2026-08-01', '2026-08-02']) {
    assert.equal(getGuildMembershipEligibility({
      membership: hero,
      bookingDate,
      hasControllers: true,
      extraControllers: 0,
      now,
    }).eligible, true);
  }
  assert.equal(getGuildMembershipEligibility({
    membership: hero,
    bookingDate: '2026-07-28',
    hasControllers: true,
    extraControllers: 1,
    now,
  }).code, 'HERO_SQUAD');
});

test('allows Master for solo and squad PS5 bookings every day', () => {
  const master = membership('GUILD_MASTER');

  for (const bookingDate of ['2026-07-28', '2026-08-01', '2026-08-02']) {
    for (const extraControllers of [0, 1, 3]) {
      assert.equal(getGuildMembershipEligibility({
        membership: master,
        bookingDate,
        hasControllers: true,
        extraControllers,
        now,
      }).eligible, true);
    }
  }
});

test('blocks racing, expired, and outside-coverage bookings', () => {
  const master = membership('GUILD_MASTER');

  assert.equal(getGuildMembershipEligibility({
    membership: master,
    bookingDate: '2026-07-28',
    hasControllers: false,
    extraControllers: 0,
    now,
  }).code, 'RACING');
  assert.equal(getGuildMembershipEligibility({
    membership: membership('GUILD_MASTER', { status: 'REVOKED' }),
    bookingDate: '2026-07-28',
    hasControllers: true,
    extraControllers: 0,
    now,
  }).code, 'INACTIVE');
  assert.equal(getGuildMembershipEligibility({
    membership: master,
    bookingDate: '2026-08-27',
    hasControllers: true,
    extraControllers: 0,
    now,
  }).code, 'OUTSIDE_COVERAGE');
});

test('prefers Master and safely ignores duplicate inactive records', () => {
  const selected = selectPreferredGuildMembership([
    membership('GUILD_HERO'),
    membership('GUILD_MASTER'),
    membership('GUILD_MASTER', { id: 'expired', expiresAt: '2026-07-27T00:00:00.000Z' }),
  ], now);

  assert.equal(selected?.id, 'GUILD_MASTER');
});

test('treats malformed, expired, and cancelled records as inactive', () => {
  assert.equal(isGuildMembershipActive(
    membership('GUILD_HERO', { expiresAt: 'not-a-date' }),
    now,
  ), false);
  assert.equal(isGuildMembershipActive(
    membership('GUILD_HERO', { expiresAt: '2026-07-27T00:00:00.000Z' }),
    now,
  ), false);
  assert.equal(isGuildMembershipActive(
    membership('GUILD_HERO', { status: 'REVOKED' }),
    now,
  ), false);
});

test('rejects crafted benefit types, missing users, stacking, and wrong percentages', () => {
  const common = {
    membership: membership('GUILD_HERO'),
    bookingDate: '2026-07-28',
    hasControllers: true,
    extraControllers: 0,
    discount: 50,
    hasLinkedUser: true,
    hasHourPass: false,
    now,
  };

  assert.equal(isGuildMembershipType('GUILD_PLATINUM'), false);
  assert.equal(rejectionCode({
    ...common,
    requestedBenefit: 'GUILD_PLATINUM',
  }), 'INVALID_BENEFIT');
  assert.equal(rejectionCode({
    ...common,
    requestedBenefit: 'GUILD_HERO',
    hasLinkedUser: false,
  }), 'NO_LINKED_USER');
  assert.equal(rejectionCode({
    ...common,
    requestedBenefit: 'GUILD_HERO',
    hasHourPass: true,
  }), 'BENEFIT_STACKING');
  assert.equal(rejectionCode({
    ...common,
    requestedBenefit: 'GUILD_HERO',
    discount: 75,
  }), 'INVALID_DISCOUNT');
  assert.equal(rejectionCode({
    ...common,
    requestedBenefit: 'GUILD_MASTER',
  }), 'NO_MEMBERSHIP');
});

test('accepts only the matching server-resolved membership at exactly 50 percent', () => {
  const result = validateGuildBenefitApplication({
    requestedBenefit: 'GUILD_MASTER',
    membership: membership('GUILD_MASTER'),
    bookingDate: '2026-07-28',
    hasControllers: true,
    extraControllers: 2,
    discount: 50,
    hasLinkedUser: true,
    hasHourPass: false,
    now,
  });

  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.benefitType, 'GUILD_MASTER');
  }
});
