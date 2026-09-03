import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';
import {
  addBookingFnbItem,
  createFnbProduct,
  FnbError,
  getActiveFnbSubtotals,
  getFnbProducts,
  parseBookingFnbItem,
  parseFnbProductInput,
  parseFnbProductUpdate,
  removeBookingFnbItem,
  updateFnbProduct,
} from '@/lib/fnb';

const prisma = new PrismaClient();

function expectFnbError(fn: () => unknown, code: string) {
  assert.throws(fn, (error: unknown) => (
    error instanceof FnbError && error.code === code
  ));
}

test('F&B catalog accepts only item name and nonnegative whole-rupee price', () => {
  assert.deepEqual(
    parseFnbProductInput({ name: '  Red Bull  ', sellingPrice: 125 }),
    { name: 'Red Bull', sellingPrice: 125 },
  );
  assert.deepEqual(parseFnbProductUpdate({ isActive: false }), { isActive: false });

  expectFnbError(
    () => parseFnbProductInput({ name: 'Red Bull', sellingPrice: 125, currentStock: 10 }),
    'INVALID_PRODUCT',
  );
  expectFnbError(
    () => parseFnbProductInput({ name: 'Red Bull', sellingPrice: 12.5 }),
    'INVALID_PRODUCT',
  );
  expectFnbError(() => parseFnbProductUpdate({}), 'INVALID_PRODUCT');
});

test('booking F&B quantities are whole numbers from one through 99', () => {
  assert.deepEqual(
    parseBookingFnbItem({ productId: 'red-bull', quantity: 99 }),
    { productId: 'red-bull', quantity: 99 },
  );
  expectFnbError(
    () => parseBookingFnbItem({ productId: 'red-bull', quantity: 0 }),
    'INVALID_BOOKING_ITEM',
  );
  expectFnbError(
    () => parseBookingFnbItem({ productId: 'red-bull', quantity: 100 }),
    'INVALID_BOOKING_ITEM',
  );
  expectFnbError(
    () => parseBookingFnbItem({ productId: 'red-bull', quantity: 1.5 }),
    'INVALID_BOOKING_ITEM',
  );
});

test('catalog prices drive booking snapshots without stock tracking', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const stationId = `fnb-station-${suffix}`;
  const adminEmail = `fnb-admin-${suffix}@example.test`;
  let adminId = '';
  let regularBookingId = '';
  let cancelledBookingId = '';
  const productIds: string[] = [];

  try {
    const admin = await prisma.user.create({
      data: {
        name: 'F&B Test Admin',
        email: adminEmail,
        password: 'not-used',
        role: 'ADMIN',
      },
    });
    adminId = admin.id;
    await prisma.station.create({
      data: {
        id: stationId,
        name: `F&B Station ${suffix}`,
        description: 'Test station',
        specs: 'Test specs',
        hourlyRate: 100,
      },
    });
    const regularBooking = await prisma.booking.create({
      data: {
        stationId,
        date: '2099-01-02',
        startTime: '10:00',
        endTime: '11:00',
        duration: 1,
        totalPrice: 100,
        status: 'CONFIRMED',
      },
    });
    regularBookingId = regularBooking.id;
    const cancelledBooking = await prisma.booking.create({
      data: {
        stationId,
        date: '2099-01-03',
        startTime: '10:00',
        endTime: '11:00',
        duration: 1,
        totalPrice: 100,
        status: 'CANCELLED',
      },
    });
    cancelledBookingId = cancelledBooking.id;

    const water = await createFnbProduct({
      name: `Water ${suffix}`,
      sellingPrice: 30,
    });
    const redBull = await createFnbProduct({
      name: `Red Bull ${suffix}`,
      sellingPrice: 125,
    });
    productIds.push(water.id, redBull.id);
    assert.deepEqual(Object.keys(redBull).sort(), [
      'id',
      'isActive',
      'name',
      'sellingPrice',
    ]);

    const orderedProducts = (await getFnbProducts(true))
      .filter((product) => productIds.includes(product.id));
    assert.deepEqual(
      orderedProducts.map((product) => product.id),
      [water.id, redBull.id],
    );

    const firstItem = await addBookingFnbItem(regularBooking.id, {
      productId: redBull.id,
      quantity: 2,
    });
    assert.equal(firstItem.productName, redBull.name);
    assert.equal(firstItem.unitPrice, 125);
    assert.equal(firstItem.subtotal, 250);

    await updateFnbProduct(redBull.id, { sellingPrice: 150 });
    const secondItem = await addBookingFnbItem(regularBooking.id, {
      productId: redBull.id,
      quantity: 1,
    });
    assert.equal(secondItem.unitPrice, 150);
    assert.equal(secondItem.subtotal, 150);

    const subtotalsBeforeRemoval = await getActiveFnbSubtotals([
      regularBooking.id,
      cancelledBooking.id,
      regularBooking.id,
    ]);
    assert.equal(subtotalsBeforeRemoval.size, 1);
    assert.equal(subtotalsBeforeRemoval.get(regularBooking.id), 400);
    assert.equal(subtotalsBeforeRemoval.get(cancelledBooking.id) ?? 0, 0);
    assert.equal(
      (await getActiveFnbSubtotals([cancelledBooking.id])).size,
      0,
    );

    const storedFirstItem = await prisma.bookingFnbItem.findUniqueOrThrow({
      where: { id: firstItem.id },
    });
    assert.equal(storedFirstItem.unitPrice, 125);
    assert.equal(storedFirstItem.subtotal, 250);

    await updateFnbProduct(redBull.id, { isActive: false });
    const activeIds = (await getFnbProducts()).map((product) => product.id);
    assert.equal(activeIds.includes(redBull.id), false);
    await assert.rejects(
      () => addBookingFnbItem(regularBooking.id, {
        productId: redBull.id,
        quantity: 1,
      }),
      (error: unknown) => error instanceof FnbError
        && error.code === 'PRODUCT_UNAVAILABLE',
    );

    await assert.rejects(
      () => addBookingFnbItem(cancelledBooking.id, {
        productId: water.id,
        quantity: 1,
      }),
      (error: unknown) => error instanceof FnbError
        && error.code === 'BOOKING_CANCELLED',
    );

    const removed = await removeBookingFnbItem(firstItem.id, admin.id);
    assert.equal(removed.status, 'VOID');
    assert.equal(removed.voidedById, admin.id);
    assert.equal(removed.voidReason, null);
    const removedAgain = await removeBookingFnbItem(firstItem.id, admin.id);
    assert.equal(removedAgain.id, removed.id);
    assert.equal(removedAgain.updatedAt.getTime(), removed.updatedAt.getTime());

    const subtotalsAfterRemoval = await getActiveFnbSubtotals([
      regularBooking.id,
      cancelledBooking.id,
    ]);
    assert.equal(subtotalsAfterRemoval.get(regularBooking.id), 150);
    assert.equal(subtotalsAfterRemoval.get(cancelledBooking.id) ?? 0, 0);

    const activeSubtotal = await prisma.bookingFnbItem.aggregate({
      where: { bookingId: regularBooking.id, status: 'ACTIVE' },
      _sum: { subtotal: true },
    });
    assert.equal(activeSubtotal._sum.subtotal, 150);
  } finally {
    if (regularBookingId || cancelledBookingId) {
      await prisma.booking.deleteMany({
        where: { id: { in: [regularBookingId, cancelledBookingId].filter(Boolean) } },
      });
    }
    if (productIds.length > 0) {
      await prisma.fnbProduct.deleteMany({ where: { id: { in: productIds } } });
    }
    if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.station.deleteMany({ where: { id: stationId } });
  }
});

after(async () => {
  await prisma.$disconnect();
});
