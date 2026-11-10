import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMineAction, availableMineTickets, mineClock, mineNow, minePhase, mineSeconds, nextMineBoundary, olderMineResult, hasMineAttempt, skipMineEntry, mineStartKey, readMineStart } from '../../lib/guess-36-client';
import { MINE_RULES, type MineRun, type MineState } from '../../lib/guess-36-mines-rules';

const now = '2026-11-08T12:00:00.000Z';
const reward = MINE_RULES.rewards[0];
const run: MineRun = { id: 'run', date: '2026-11-08', status: 'ACTIVE', version: 1, startedAt: now, expiresAt: '2026-11-08T12:01:30.000Z', settledAt: null, tiles: [{ index: 0, color: 'GREEN' }], greens: 1, reward, nextReward: MINE_RULES.rewards[1], ticketId: null };
const state: MineState = { recoveryKey: 'fixture-key', eligibility: { freeAvailable: false, bonuses: [], review: { claimed: false, date: run.date, nextResetAt: '2026-11-08T18:30:00.000Z', serverNow: now } }, mode: 'MINES', enabled: true, authenticated: true, serverNow: now, date: run.date, nextDayAt: '2026-11-08T18:30:00.000Z', legacyUsedToday: false, rules: MINE_RULES, run, rewardTickets: [] };

test('page entry animates for fresh and depleted accounts while recovered runs and pauses open promptly', () => {
  assert.equal(skipMineEntry(state), true);
  assert.equal(skipMineEntry({ ...state, run: null }), false);
  assert.equal(skipMineEntry({ ...state, run: null, legacyUsedToday: true }), false);
  const fresh = { ...state, run: null, eligibility: { ...state.eligibility, freeAvailable: true } };
  assert.equal(skipMineEntry(fresh), false);
  assert.equal(skipMineEntry({ ...fresh, enabled: false }), true);
  assert.equal(skipMineEntry({ ...fresh, run: { ...run, status: 'LOST' } }), true);
});

test('countdown uses elapsed monotonic time despite phone-clock changes', t => {
  const clock = mineClock(now, 1000);
  t.mock.method(Date, 'now', () => Date.parse('2099-01-01'));
  assert.equal(mineSeconds(run, mineNow(clock, 31000)), 60);
  t.mock.method(Date, 'now', () => 0);
  assert.equal(mineSeconds(run, mineNow(clock, 61000)), 30);
  assert.equal(mineSeconds(run, mineNow(clock, 92000)), 0);
  assert.equal(mineNow(clock, 999), Date.parse(now));
});

test('committed tickets insert once; redeemed and expired results never resurrect stale cards', () => {
  const ticket = { id: 'ticket', status: 'UNUSED', expiresAt: '2026-11-09T18:30:00.000Z' };
  const completed = { ...run, status: 'COLLECTED' as const, version: 2, ticket, ticketId: ticket.id };
  const result = { run: completed, serverNow: now };
  const first = applyMineAction(state, result);
  assert.equal(first.rewardTickets.length, 1);
  assert.equal(applyMineAction(first, result).rewardTickets.length, 1);
  assert.equal(state.rewardTickets.length, 0);
  assert.equal(availableMineTickets({ ...first, run: { ...completed, ticket: { ...ticket, status: 'REDEEMED' } } }, Date.parse(now)).length, 0);
  assert.equal(availableMineTickets(first, Date.parse(ticket.expiresAt)).length, 0);
});

test('phase distinguishes uncollected progress, secured rewards, losses and timeouts', () => {
  assert.equal(minePhase(state), 'PLAYING');
  assert.equal(minePhase({ ...state, run: { ...run, status: 'COLLECTED' } }), 'SECURED');
  assert.equal(minePhase({ ...state, run: { ...run, status: 'LOST', reward: null } }), 'LOST');
  assert.equal(minePhase({ ...state, run: { ...run, status: 'TIMED_OUT' } }), 'TIMED_OUT');
  assert.equal(minePhase({ ...state, run: null }), 'READY');
  assert.equal(minePhase({ ...state, run: null, enabled: false }), 'PAUSED');
  assert.equal(minePhase({ ...state, run: null, legacyUsedToday: true }), 'USED');
  assert.equal(minePhase({ ...state, authenticated: false }), 'SIGN_IN');
});

test('stale same-run responses cannot replace newer progress; redemption at equal version can update', () => {
  assert.equal(olderMineResult(state, { ...state, run: { ...run, version: 0 } }), true);
  assert.equal(olderMineResult(state, { ...state, run: { ...run, status: 'COLLECTED' } }), false);
  assert.equal(olderMineResult(state, { ...state, run: null }), false);
});

test('one boundary selects the earliest ticket expiry or IST day change', () => {
  const expiry = '2026-11-08T13:00:00.000Z';
  const withTicket = { ...state, rewardTickets: [{ id: 'ticket', reward, expiresAt: expiry }] };
  assert.equal(nextMineBoundary(withTicket, Date.parse(now)), Date.parse(expiry));
  assert.equal(nextMineBoundary(withTicket, Date.parse(expiry)), Date.parse(state.nextDayAt));
});


test('bonus availability is separate from free or legacy eligibility, with an independent expiry boundary', () => {
 const bonus = { ...state, run: null, legacyUsedToday: true, eligibility: { ...state.eligibility, bonuses: [{ id: 'bonus', expiresAt: '2026-11-08T13:00:00Z' }] } };
 assert.equal(hasMineAttempt(bonus), true); assert.equal(minePhase(bonus), 'READY');
 assert.equal(nextMineBoundary(bonus, Date.parse(now)), Date.parse('2026-11-08T13:00:00Z'));
 const updated = applyMineAction(bonus, { run, serverNow: now, eligibility: { ...bonus.eligibility, bonuses: [] } });
 assert.equal(hasMineAttempt(updated), false);
});
test('first-reveal recovery is account scoped and malformed saved requests fail closed', t => {
 const saved = { requestId: 'fixture-request-id-0001', date: state.date, index: 5 };
 const key = mineStartKey(state)!;
 const storage = new Map([[key, JSON.stringify(saved)]]);
 const previous = globalThis.localStorage;
 Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (name: string) => storage.get(name) ?? null } });
 t.after(() => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous }));
 assert.deepEqual(readMineStart(state), saved);
 assert.equal(readMineStart({ ...state, recoveryKey: 'another-account' }), null);
 storage.set(key, JSON.stringify({ ...saved, index: 36 })); assert.throws(() => readMineStart(state), /Saved first reveal/);
});
