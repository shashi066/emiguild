import assert from 'node:assert/strict';
import test from 'node:test';
import { possibleEmicReturn, predictionOddsBasisPoints } from '../../lib/watch-party-odds';

test('converts valid admin reward multipliers to integer basis points', () => {
  assert.equal(predictionOddsBasisPoints('1.00'), 10_000);
  assert.equal(predictionOddsBasisPoints('2.25'), 22_500);
  assert.equal(predictionOddsBasisPoints(' 3.5 '), 35_000);
  assert.equal(predictionOddsBasisPoints('10.00'), 100_000);
});

test('rejects blank, scientific, out-of-range, and over-precise reward multipliers', () => {
  for (const value of ['', '1e1', '0.99', '10.01', '2.001', 'NaN']) {
    assert.equal(predictionOddsBasisPoints(value), null, `${value || 'blank'} should be invalid`);
  }
});

test('calculates the displayed possible EMIC reward with backend unit flooring', () => {
  assert.equal(possibleEmicReturn(25, '2.25x'), 56.2);
  assert.equal(possibleEmicReturn(25, '1.75x'), 43.7);
  assert.equal(possibleEmicReturn(1, '1.01x'), 1);
});
