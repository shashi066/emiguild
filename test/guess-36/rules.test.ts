import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GUESS_36_REWARDS, GUESS_36_NUMBERS, guess36CoveredNumbers,
  guess36SelectionMatches, guess36Tier, guess36WinningSelections, normalizeGuess36Rewards, parseGuess36Selection,
} from '../../lib/guess-36-rules';
import type { Guess36Selection } from '../../lib/guess-36-types';

test('all 36 outcomes cover exactly one exact, parity, range and row selection', () => {
  for (const number of GUESS_36_NUMBERS) {
    const winners = guess36WinningSelections(number);
    assert.equal(winners.length, 4);
    assert.ok(winners.every((selection) => guess36SelectionMatches(selection, number)));
    assert.equal(winners[1].type, number % 2 ? 'ODD' : 'EVEN');
    assert.deepEqual(winners[2], { type: 'RANGE', value: number <= 12 ? 1 : number <= 24 ? 2 : 3 });
    assert.deepEqual(winners[3], { type: 'ROW', value: (number + 2) % 3 + 1 });
    for (const candidate of GUESS_36_NUMBERS) assert.equal(guess36SelectionMatches({ type: 'NUMBER', value: candidate }, number), candidate === number);
  }
  const groups: Guess36Selection[] = [{ type: 'EVEN' }, { type: 'ODD' }, ...[1, 2, 3].flatMap((value): Guess36Selection[] => [{ type: 'ROW', value }, { type: 'RANGE', value }])];
  for (const group of groups) assert.equal(guess36CoveredNumbers(group).length, guess36Tier(group) === 'PARITY' ? 18 : 12);
  assert.deepEqual(guess36CoveredNumbers({ type: 'ROW', value: 1 }), [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]);
  assert.deepEqual(guess36CoveredNumbers({ type: 'RANGE', value: 2 }), [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  assert.deepEqual(guess36WinningSelections(0), []);
  assert.deepEqual(guess36WinningSelections(37), []);
});

test('only one strict choice is accepted, with correct number and group bounds', () => {
  for (const invalid of [null, [], { type: 'EVEN', number: 2 }, { type: 'NUMBER', value: '3' }, { type: 'NUMBER', value: 0 },
    { type: 'NUMBER', value: 37 }, { type: 'ROW', value: 4 }, { type: 'RANGE', value: 1.5 }, { type: 'ODD', reward: 60 }, { type: 'ZERO' }]) {
    assert.equal(parseGuess36Selection(invalid), null);
  }
  assert.deepEqual(parseGuess36Selection({ type: 'NUMBER', value: 36 }), { type: 'NUMBER', value: 36 });
  assert.deepEqual(parseGuess36Selection({ type: 'EVEN' }), { type: 'EVEN' });
});

test('reward validation requires three tiers and generates names without accepting invalid values', () => {
  assert.deepEqual(normalizeGuess36Rewards(DEFAULT_GUESS_36_REWARDS), DEFAULT_GUESS_36_REWARDS);
  for (const reward of [{ type: 'GAMING_TIME', value: 0 }, { type: 'GAMING_TIME', value: '10' }, { type: 'GAMING_TIME', value: 10001 },
    { type: 'RACING_TIME', value: 1.5 }, { type: 'DISCOUNT', value: 101 }, { type: 'PASS', name: ' ' }, { type: 'PASS', name: 'x'.repeat(81) },
    { type: 'PASS', name: 'Hero', value: 600 }, { type: 'EMIC', value: 0 }, { type: 'EMIC', value: 1.5 },
    { type: 'EMIC', value: '500' }, { type: 'EMIC', value: 1_000_001 }, { type: 'UNKNOWN', value: 10 }]) {
    assert.throws(() => normalizeGuess36Rewards({ ...DEFAULT_GUESS_36_REWARDS, EXACT: reward }));
  }
  assert.throws(() => normalizeGuess36Rewards({ EXACT: DEFAULT_GUESS_36_REWARDS.EXACT }));
  const rewards = normalizeGuess36Rewards({ EXACT: { type: 'PASS', name: ' Hero Pass ' }, GROUP: { type: 'RACING_TIME', value: 30, name: 'Ignored' }, PARITY: { type: 'DISCOUNT', value: 100 } });
  assert.deepEqual(rewards.EXACT, { type: 'PASS', name: 'Hero Pass' });
  assert.equal(rewards.GROUP.name, '30 Minutes Racing');
  assert.equal(rewards.PARITY.name, '100% Booking Discount');
  const emic = normalizeGuess36Rewards({ ...DEFAULT_GUESS_36_REWARDS, EXACT: { type: 'EMIC', value: 500, name: 'Ignored' } });
  assert.deepEqual(emic.EXACT, { type: 'EMIC', name: '500 EMIC', value: 500 });
});
