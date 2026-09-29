import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  calculatePs5RentalTotal,
  canTransitionPs5Rental,
  createPs5RentalSchema,
  parsePs5RentalPrice,
  resolvePs5RentalAvailability,
} from '../../lib/ps5-rental';

test('rental availability defaults safely and supports the legacy flag', () => {
  assert.equal(resolvePs5RentalAvailability({}), 'COMING_SOON');
  assert.equal(resolvePs5RentalAvailability({ ps5_rental_enabled: 'true' }), 'AVAILABLE');
  assert.equal(resolvePs5RentalAvailability({ ps5_rental_enabled: 'false' }), 'DISABLED');
  assert.equal(resolvePs5RentalAvailability({ ps5_rental_status: 'COMING_SOON', ps5_rental_enabled: 'true' }), 'COMING_SOON');
});

test('pricing accepts bounded integer rupees and calculates controller-days', () => {
  assert.equal(parsePs5RentalPrice('1500', 1200), 1500);
  assert.equal(parsePs5RentalPrice('12.5', 1200), 1200);
  assert.equal(parsePs5RentalPrice('-1', 1200), 1200);
  assert.equal(calculatePs5RentalTotal(1200, 500, 3, 2), 6600);
});

test('rental request requires unique game IDs and valid contact details', () => {
  const base = {
    rentalDays: 2,
    extraControllers: 1,
    selectedGameIds: ['game-1'],
    customerName: 'Player One',
    customerPhone: '+919876543210',
    deliveryAddress: '12 Test Street',
    deliveryCity: 'Hyderabad',
    deliveryPincode: '500001',
    acceptedTerms: true,
  } as const;
  assert.equal(createPs5RentalSchema.safeParse(base).success, true);
  assert.equal(createPs5RentalSchema.safeParse({ ...base, selectedGameIds: ['game-1', 'game-1'] }).success, false);
  assert.equal(createPs5RentalSchema.safeParse({ ...base, deliveryPincode: 'ABC123' }).success, false);
});

test('only approved lifecycle transitions are allowed', () => {
  assert.equal(canTransitionPs5Rental('PENDING', 'CONFIRMED'), true);
  assert.equal(canTransitionPs5Rental('PENDING', 'CANCELLED'), true);
  assert.equal(canTransitionPs5Rental('CONFIRMED', 'DELIVERED'), true);
  assert.equal(canTransitionPs5Rental('DELIVERED', 'RETURNED'), true);
  assert.equal(canTransitionPs5Rental('PENDING', 'RETURNED'), false);
  assert.equal(canTransitionPs5Rental('RETURNED', 'CONFIRMED'), false);
});

test('homepage and spin presentation include rollout and low-motion behavior', () => {
  const hero = readFileSync('components/HeroActions.tsx', 'utf8');
  const spin = readFileSync('components/DailySpinWidget.tsx', 'utf8');
  assert.match(hero, /ps5RentalStatus !== 'DISABLED'/);
  assert.doesNotMatch(hero, /badge=.*Coming Soon/);
  assert.match(hero, /href="\/ps5-rental"/);
  assert.match(spin, /winnerGlowIn/);
});
