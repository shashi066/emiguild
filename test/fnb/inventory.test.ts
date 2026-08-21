import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FnbInventoryError,
  parseBookingFnbItem,
  parseFnbProductInput,
  parseFnbStockAdjustment,
  parseVoidBookingFnbItem,
} from '@/lib/fnb-inventory';

function expectFnbError(fn: () => unknown, code: string) {
  assert.throws(fn, (error: unknown) => (
    error instanceof FnbInventoryError && error.code === code
  ));
}

test('F&B product input preserves an optional initial stock and normalizes a blank SKU', () => {
  const product = parseFnbProductInput({
    name: '  Cola  ',
    category: ' Drinks ',
    sku: '   ',
    sellingPrice: 40,
    costPrice: 25,
    lowStockThreshold: 4,
    initialStock: 12,
  });

  assert.equal(product.name, 'Cola');
  assert.equal(product.category, 'Drinks');
  assert.equal(product.sku, null);
  assert.equal(product.initialStock, 12);
});

test('F&B stock adjustments enforce direction for restocks and waste', () => {
  expectFnbError(
    () => parseFnbStockAdjustment({ type: 'RESTOCK', quantityChange: -1, note: 'incorrect' }),
    'INVALID_STOCK_ADJUSTMENT',
  );
  expectFnbError(
    () => parseFnbStockAdjustment({ type: 'WASTE', quantityChange: 1, note: 'incorrect' }),
    'INVALID_STOCK_ADJUSTMENT',
  );
  assert.deepEqual(
    parseFnbStockAdjustment({ type: 'WASTE', quantityChange: -2, note: 'Damaged cans' }),
    { type: 'WASTE', quantityChange: -2, note: 'Damaged cans' },
  );
});

test('booking F&B sales require a positive quantity and voids require a reason', () => {
  expectFnbError(
    () => parseBookingFnbItem({ productId: 'cola', quantity: 0 }),
    'INVALID_BOOKING_ITEM',
  );
  expectFnbError(
    () => parseVoidBookingFnbItem({ reason: ' ' }),
    'INVALID_VOID',
  );
});
