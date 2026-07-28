import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_GAME_REQUEST_MAX_LENGTH,
  CUSTOMER_GAME_REQUEST_MAX_LENGTH,
  adminGameRequestSchema,
  customerGameRequestSchema,
} from '../../lib/game-request';
import { escapeHtml } from '../../lib/notify';

test('trims customer game requests and treats blank text as absent', () => {
  assert.equal(
    customerGameRequestSchema.parse('  Tekken 8  '),
    'Tekken 8',
  );
  assert.equal(customerGameRequestSchema.parse('   '), undefined);
  assert.equal(customerGameRequestSchema.parse(undefined), undefined);
});

test('enforces separate customer and admin request limits', () => {
  assert.equal(
    customerGameRequestSchema.safeParse(
      'x'.repeat(CUSTOMER_GAME_REQUEST_MAX_LENGTH),
    ).success,
    true,
  );
  assert.equal(
    customerGameRequestSchema.safeParse(
      'x'.repeat(CUSTOMER_GAME_REQUEST_MAX_LENGTH + 1),
    ).success,
    false,
  );
  assert.equal(
    adminGameRequestSchema.safeParse(
      'x'.repeat(ADMIN_GAME_REQUEST_MAX_LENGTH),
    ).success,
    true,
  );
  assert.equal(
    adminGameRequestSchema.safeParse(
      'x'.repeat(ADMIN_GAME_REQUEST_MAX_LENGTH + 1),
    ).success,
    false,
  );
});

test('escapes game requests before inserting them into booking emails', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)"> & ready'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; ready',
  );
});
