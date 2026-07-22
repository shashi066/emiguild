import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {
  generateTemporaryPassword,
  getPasswordResetDate,
  hashPassword,
} from '../../lib/password-reset';

test('temporary passwords use the required secure character groups', () => {
  for (let index = 0; index < 100; index += 1) {
    const password = generateTemporaryPassword();

    assert.equal(password.length, 10);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /[0-9]/);
    assert.match(password, /[@#!]/);
    assert.doesNotMatch(password, /[0O1Il]/);
  }
});

test('password hashes use bcrypt and do not expose the temporary password', async () => {
  const password = 'Secure9@Ab';
  const hashed = await hashPassword(password);

  assert.notEqual(hashed, password);
  assert.equal(await bcrypt.compare(password, hashed), true);
  assert.equal(await bcrypt.compare('Wrong9@Ab', hashed), false);
});

test('daily reset dates roll over at midnight IST', () => {
  assert.equal(getPasswordResetDate(new Date('2026-07-21T18:29:59.000Z')), '2026-07-21');
  assert.equal(getPasswordResetDate(new Date('2026-07-21T18:30:00.000Z')), '2026-07-22');
});
