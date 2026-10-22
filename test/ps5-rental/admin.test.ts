import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { NextRequest } from 'next/server';
import { prisma } from '../../lib/prisma';
import { adminRentalCreateSchema, discountedRentalTotal, rentalEndDate } from '../../lib/ps5-rental';

// Route tests use a private database and a controlled authenticated session.
assert.equal(process.env.DATABASE_URL, 'file:./rental-admin-test.db');
let role = 'ADMIN';
require('../../auth');
const authModule = require.cache[require.resolve('../../auth')]!;
const savedAuth = authModule.exports;
authModule.exports = { auth: async () => ({ user: { id: 'admin', role } }) };
const { POST } = require('../../app/api/admin/ps5-rentals/route');
const { PUT } = require('../../app/api/admin/ps5-rentals/[id]/route');
const request = (body: unknown) => new NextRequest('http://localhost/api/admin/ps5-rentals', { method: 'POST', body: JSON.stringify(body) });
const prefix = `rental-test-${Date.now()}`;
const data = { userId: null, customerName: 'Guest', customerPhone: '9876543210', deliveryAddress: '123 Test Street', deliveryCity: 'Hyderabad', deliveryPincode: '500001', rentalDays: 2, extraControllers: 1, pricePerDay: 1200, controllerPrice: 500, discount: 10, startDate: '2026-10-18', selectedGames: [prefix] };
after(async () => { authModule.exports = savedAuth; await prisma.ps5Rental.deleteMany(); await prisma.game.deleteMany(); await prisma.user.deleteMany(); await prisma.$disconnect(); });

test('validates real dates, rental bounds and discounts; calculates return date and rounded totals', () => {
  assert.equal(rentalEndDate('2026-12-31', 2), '2027-01-02');
  assert.equal(discountedRentalTotal(1200, 500, 2, 1, 10), 3060);
  assert.equal(discountedRentalTotal(999, 0, 1, 0, 15), 849);
  assert.equal(discountedRentalTotal(1200, 500, 2, 1, 100), 0);
  for (const patch of [{ startDate: '2026-02-30' }, { discount: 5 }, { discount: 101 }, { extraControllers: 4 }, { rentalDays: 0 }, { pricePerDay: -1 }, { customerPhone: 'abc' }, { selectedGames: [prefix, prefix] }]) assert.equal(adminRentalCreateSchema.safeParse({ ...data, ...patch }).success, false);
});

test('admin routes create guests and users, edit totals, protect conflicts and reject unauthorized writes', async () => {
  await prisma.game.create({ data: { name: prefix, category: 'PS5' } });
  let response = await POST(request(data)); assert.equal(response.status, 201);
  let rental = (await response.json()).rental;
  assert.equal(rental.user, null); assert.equal(rental.source, 'WALK_IN'); assert.equal(rental.status, 'CONFIRMED'); assert.equal(rental.totalPrice, 3060); assert.equal(rental.endDate, '2026-10-20');
  const stale = rental.updatedAt;
  response = await PUT(request({ expectedUpdatedAt: stale, rentalDays: 3, discount: 20 }), { params: Promise.resolve({ id: rental.id }) }); assert.equal(response.status, 200);
  rental = (await response.json()).rental;
  assert.equal(rental.pricePerDay, 1200); assert.equal(rental.totalPrice, 4080); assert.equal(rental.endDate, '2026-10-21');
  response = await PUT(request({ expectedUpdatedAt: stale, adminComment: 'stale' }), { params: Promise.resolve({ id: rental.id }) }); assert.equal(response.status, 409);
  response = await PUT(request({ expectedUpdatedAt: rental.updatedAt, status: 'RETURNED' }), { params: Promise.resolve({ id: rental.id }) }); assert.equal(response.status, 409);
  response = await POST(request({ ...data, selectedGames: ['missing-game'] })); assert.equal(response.status, 400);
  const user = await prisma.user.create({ data: { name: 'Registered', email: `${prefix}@example.test`, password: 'not-a-login' } });
  response = await POST(request({ ...data, userId: user.id })); assert.equal(response.status, 201);
  const owned = (await response.json()).rental; assert.equal(owned.user.email, user.email);
  response = await POST(request({ ...data, userId: user.id })); assert.equal(response.status, 409);
  response = await PUT(request({ expectedUpdatedAt: owned.updatedAt, status: 'CANCELLED' }), { params: Promise.resolve({ id: owned.id }) }); assert.equal(response.status, 200);
  assert.equal((await response.json()).rental.activeUserId, null);
  response = await POST(request({ ...data, userId: user.id })); assert.equal(response.status, 201);
  role = 'USER';
  assert.equal((await POST(request(data))).status, 403);
  assert.equal((await PUT(request({ expectedUpdatedAt: rental.updatedAt, discount: 100 }), { params: Promise.resolve({ id: rental.id }) })).status, 403);
});
