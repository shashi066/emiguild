import assert from 'node:assert/strict';
import test from 'node:test';
import { isPassDateEligible } from '../../lib/pass-rules';

test('allows passes from Monday through Friday', () => {
  assert.equal(isPassDateEligible('2026-07-27'), true);
  assert.equal(isPassDateEligible('2026-07-28'), true);
  assert.equal(isPassDateEligible('2026-07-31'), true);
  assert.equal(isPassDateEligible('2026-08-03'), true);
});

test('blocks passes on Saturday and Sunday', () => {
  assert.equal(isPassDateEligible('2026-08-01'), false);
  assert.equal(isPassDateEligible('2026-08-02'), false);
});

test('rejects malformed or impossible dates', () => {
  assert.equal(isPassDateEligible('2026-02-30'), false);
  assert.equal(isPassDateEligible('2026-13-01'), false);
  assert.equal(isPassDateEligible('01-08-2026'), false);
  assert.equal(isPassDateEligible(''), false);
});
