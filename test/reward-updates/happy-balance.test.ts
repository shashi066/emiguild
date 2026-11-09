import assert from 'node:assert/strict';
import test from 'node:test';
import { happyBalance } from '../../lib/happy-balance';

const at = (day: number, time = '12:00:00') => new Date(`2026-11-${String(day).padStart(2, '0')}T${time}+05:30`);
const account = { happyAvailable: 5, happyVersion: 3, happyBalanceDay: '2026-11-09', happyLastClaimedAt: null, createdAt: at(1) };
test('one stock expiry per missed IST day, including weekends and offline days, clamped at zero', () => {
  for (const [day, expected] of [[9, 5], [10, 4], [11, 3], [14, 0], [30, 0]]) assert.equal(happyBalance(account, at(day)).available, expected);
  assert.equal(happyBalance(account, at(9, '23:59:59')).available, 5);
  assert.equal(happyBalance(account, at(10, '00:00:00')).available, 4);
  assert.equal(happyBalance(account, at(10)).version, 4);
  assert.equal(account.happyAvailable, 5, 'projection never writes storage');
});
test('a successful claim counts for its day, even if a refill follows it', () => {
  const claimed = { ...account, happyAvailable: 4, happyLastClaimedAt: at(9) };
  assert.equal(happyBalance(claimed, at(10)).available, 4);
  assert.equal(happyBalance(claimed, at(11)).available, 3);
  assert.equal(happyBalance({ ...claimed, happyAvailable: 5 }, at(10)).available, 5);
  assert.equal(happyBalance({ ...account, happyLastClaimedAt: at(8) }, at(10)).available, 4);
});
test('new accounts begin on their creation date; year changes use calendar days', () => {
  assert.equal(happyBalance({ ...account, happyBalanceDay: null, createdAt: at(9) }, at(10)).available, 4);
  const end = { ...account, happyBalanceDay: '2026-12-31' };
  assert.equal(happyBalance(end, new Date('2027-01-01T00:00:00+05:30')).available, 4);
  assert.equal(happyBalance(account, at(8)).available, 5, 'injected earlier clock never retroactively depletes');
});
