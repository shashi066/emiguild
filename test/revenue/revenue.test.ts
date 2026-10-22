import assert from 'node:assert/strict';
import { after, before, describe, mock, test } from 'node:test';
import { NextRequest } from 'next/server';
import { prisma } from '../../lib/prisma';
import { getAdminRevenue } from '../../lib/admin-revenue';

describe('booking and PS5 rental revenue', { skip: process.env.REVENUE_DB_TESTS !== '1' }, () => {
  const prefix = `revenue-${Date.now()}`;
  let stationId: string;
  let role: string | null = 'ADMIN';
  let authModule: NodeModule;
  let originalAuth: unknown;
  let rangeGet: (request: NextRequest) => Promise<Response>;
  let statsGet: () => Promise<Response>;
  let confirmedRentalId: string;

  before(async () => {
    assert.match(process.env.DATABASE_URL ?? '', /^file:.*revenue-test/);
    assert.deepEqual(await getAdminRevenue(), { revenue: 0, bookingRevenue: 0, rentalRevenue: 0, bookingCount: 0, rentalCount: 0 }, 'Use a fresh disposable database');
    require('../../auth');
    authModule = require.cache[require.resolve('../../auth')]!;
    originalAuth = authModule.exports;
    authModule.exports = { auth: async () => role ? { user: { id: 'review-admin', role } } : null };
    rangeGet = require('../../app/api/admin/revenue-range/route').GET;
    statsGet = require('../../app/api/admin/stats/route').GET;

    const station = await prisma.station.create({ data: { name: prefix, description: 'Revenue fixture', specs: 'PS5', hourlyRate: 100 } });
    stationId = station.id;
    for (const [date, status, totalPrice] of [
      ['2026-10-21', 'CONFIRMED', 1000], ['2026-10-21', 'PENDING', 200], ['2026-10-21', 'CANCELLED', 900],
      ['2026-10-22', 'COMPLETED', 400], ['2026-09-30', 'CONFIRMED', 50], ['2026-10-01', 'CHECKED_IN', 150],
      ['2026-11-01', 'CONFIRMED', 80],
    ] as const) await prisma.booking.create({ data: { stationId, date, status, totalPrice, startTime: '10:00', endTime: '11:00', duration: 1 } });

    const users = await Promise.all(Array.from({ length: 4 }, (_, index) => prisma.user.create({ data: {
      name: `${prefix}-${index}`, email: `${prefix}-${index}@example.test`, password: 'not-a-login',
    } })));
    const rentals = [
      { startDate: '2026-10-21', status: 'CONFIRMED', source: 'ONLINE', totalPrice: 3060, discount: 10, userId: users[0].id, rentalDays: 2, pricePerDay: 1200, controllerPrice: 500, extraControllers: 1 },
      { startDate: '2026-10-21', status: 'DELIVERED', source: 'WALK_IN', totalPrice: 500 },
      { startDate: '2026-10-22', status: 'RETURNED', source: 'ONLINE', totalPrice: 700, userId: users[0].id },
      { startDate: '2026-10-21', status: 'PENDING', source: 'ONLINE', totalPrice: 900, userId: users[3].id },
      { startDate: '2026-10-21', status: 'CANCELLED', source: 'ONLINE', totalPrice: 1100, userId: users[0].id },
      { startDate: '2026-09-30', status: 'RETURNED', source: 'WALK_IN', totalPrice: 200 },
      { startDate: '2026-10-01', status: 'CONFIRMED', source: 'WALK_IN', totalPrice: 300, userId: users[1].id },
      { startDate: '2026-11-01', status: 'CONFIRMED', source: 'WALK_IN', totalPrice: 800 },
      { startDate: null, status: 'CONFIRMED', source: 'ONLINE', totalPrice: 250, userId: users[2].id },
    ];
    for (const [index, rental] of rentals.entries()) {
      const created = await prisma.ps5Rental.create({ data: {
        rentalDays: 1, pricePerDay: rental.totalPrice, selectedGames: '[]', customerName: prefix, customerPhone: '9876543210',
        deliveryAddress: '123 Test Road', deliveryCity: 'Hyderabad', deliveryPincode: '500001',
        createdAt: new Date('2026-10-25T00:00:00Z'),
        activeUserId: ['CONFIRMED', 'PENDING', 'DELIVERED'].includes(rental.status) ? rental.userId ?? null : null,
        ...rental,
      } });
      if (index === 0) confirmedRentalId = created.id;
    }
  });

  after(async () => {
    if (authModule) authModule.exports = originalAuth;
    if (stationId) await prisma.station.delete({ where: { id: stationId } });
    await prisma.ps5Rental.deleteMany({ where: { customerName: prefix } });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await prisma.$disconnect();
  });

  test('all-time revenue combines sources, uses stored discounts once, and preserves booking eligibility', async () => {
    assert.deepEqual(await getAdminRevenue(), { revenue: 7690, bookingRevenue: 1880, rentalRevenue: 5810, bookingCount: 6, rentalCount: 7 });
  });

  test('inclusive ranges use rental start dates, not creation dates or each day of a multi-day rental', async () => {
    assert.deepEqual(await getAdminRevenue({ from: '2026-10-21', to: '2026-10-21' }), { revenue: 4760, bookingRevenue: 1200, rentalRevenue: 3560, bookingCount: 2, rentalCount: 2 });
    assert.deepEqual(await getAdminRevenue({ from: '2026-10-22', to: '2026-10-22' }), { revenue: 1100, bookingRevenue: 400, rentalRevenue: 700, bookingCount: 1, rentalCount: 1 });
    assert.deepEqual(await getAdminRevenue({ from: '2026-10-21', to: '2026-10-22' }), { revenue: 5860, bookingRevenue: 1600, rentalRevenue: 4260, bookingCount: 3, rentalCount: 3 });
    assert.deepEqual(await getAdminRevenue({ from: '2026-10-01', to: '2026-10-21' }), { revenue: 5210, bookingRevenue: 1350, rentalRevenue: 3860, bookingCount: 3, rentalCount: 3 });
    assert.equal((await getAdminRevenue({ from: '2026-09-30', to: '2026-09-30' })).revenue, 250);
  });

  test('empty ranges return zeros and legacy unscheduled rentals appear only in all-time totals', async () => {
    assert.deepEqual(await getAdminRevenue({ from: '2040-01-01', to: '2040-01-31' }), { revenue: 0, bookingRevenue: 0, rentalRevenue: 0, bookingCount: 0, rentalCount: 0 });
    const dated = await getAdminRevenue({ from: '2026-01-01', to: '2026-12-31' });
    const all = await getAdminRevenue();
    assert.equal(all.rentalRevenue - dated.rentalRevenue, 250);
    assert.equal(all.rentalCount - dated.rentalCount, 1);
  });

  test('edits and cancellation update revenue without ledger entries or duplicate counting', async () => {
    const range = { from: '2026-10-21', to: '2026-10-21' };
    try {
      await prisma.ps5Rental.update({ where: { id: confirmedRentalId }, data: { discount: 20, totalPrice: 2720 } });
      assert.equal((await getAdminRevenue(range)).revenue, 4420);
      await prisma.ps5Rental.update({ where: { id: confirmedRentalId }, data: { status: 'CANCELLED' } });
      assert.deepEqual(await getAdminRevenue(range), { revenue: 1700, bookingRevenue: 1200, rentalRevenue: 500, bookingCount: 2, rentalCount: 1 });
    } finally {
      await prisma.ps5Rental.update({ where: { id: confirmedRentalId }, data: { status: 'CONFIRMED', discount: 10, totalPrice: 3060 } });
    }
    const before = await prisma.ps5Rental.findMany({ orderBy: { id: 'asc' } });
    assert.deepEqual(await getAdminRevenue(range), await getAdminRevenue(range));
    assert.deepEqual(await prisma.ps5Rental.findMany({ orderBy: { id: 'asc' } }), before);
  });

  test('range API returns combined revenue and separate booking/rental counts', async () => {
    const response = await rangeGet(new NextRequest('http://localhost/api/admin/revenue-range?from=2026-10-21&to=2026-10-22'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { from: '2026-10-21', to: '2026-10-22', revenue: 5860, bookingRevenue: 1600, rentalRevenue: 4260, bookingCount: 3, rentalCount: 3 });
    for (const query of ['', 'from=2026-02-30&to=2026-03-01', 'from=2026-10-22&to=2026-10-21']) {
      assert.equal((await rangeGet(new NextRequest(`http://localhost/api/admin/revenue-range?${query}`))).status, 400);
    }
  });

  test('stats API shares totals and uses the IST date across a UTC day boundary', async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-21T20:00:00Z') });
    try {
      const response = await statsGet();
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.totalRevenue, 7690);
      assert.equal(data.rentalRevenue, 5810);
      assert.equal(data.rentalCount, 7);
      assert.equal(data.todayBookings, 1, 'It is already 22 October in India');
    } finally { mock.timers.reset(); }
  });

  test('revenue endpoints remain admin-only', async () => {
    try {
      for (role of [null, 'USER']) {
        assert.equal((await statsGet()).status, 403);
        assert.equal((await rangeGet(new NextRequest('http://localhost/api/admin/revenue-range?from=2026-10-21&to=2026-10-22'))).status, 403);
      }
    } finally { role = 'ADMIN'; }
  });
});
