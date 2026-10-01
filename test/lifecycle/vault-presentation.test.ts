import test from 'node:test';
import assert from 'node:assert/strict';
import { selectNextUnlock, selectVaultAction } from '../../lib/lifecycle/vault-presentation';
import { GameProgress } from '../../lib/lifecycle/rules';
const now = new Date('2026-10-01T12:00:00Z');
function game(id: GameProgress['id'], overrides: Partial<GameProgress> = {}): GameProgress {
  return { id, title: id, status: 'available', summary: '', details: [], href: '/', action: 'View',
    deadline: { at: '2026-10-01T18:30:00Z', label: 'Reset' }, facts: { dailyAvailable: true }, ...overrides };
}
test('one primary action prefers claims, then deadline, then Guess 36', () => {
  const games = [game('spin'), game('artifacts'), game('guess36')];
  assert.equal(selectVaultAction(games, now)?.game.id, 'guess36');
  games.push(game('tower', { facts: { canClaim: true } }));
  assert.equal(selectVaultAction(games, now)?.label, 'Claim secured reward');
  games.pop();
  games[0].deadline!.at = '2026-10-01T13:00:00Z';
  assert.equal(selectVaultAction(games, now)?.game.id, 'spin');
});
test('expired, used, disabled and failed sections never become primary actions', () => {
  assert.equal(selectVaultAction([
    game('guess36', { deadline: { at: now.toISOString(), label: 'Close' } }),
    game('spin', { status: 'completed', facts: { usedToday: true } }),
    game('artifacts', { status: 'disabled' }),
    game('tower', { status: 'error', facts: { canClaim: true } }),
  ], now), null);
});
test('Tower fallback needs an active run or a current token', () => {
  assert.equal(selectVaultAction([game('tower', { facts: { tokenExpiries: [now.toISOString()] } })], now), null);
  assert.equal(selectVaultAction([game('tower', { status: 'active' })], now)?.label, 'Continue Tower');
});
test('next unlock ranks real positive progress and uses artifacts for equal completion', () => {
  const spin = game('spin', { facts: { goals: [{ id: 'spin', title: 'Epic', current: 5, total: 10, reward: 'Epic reward' }] } });
  const artifact = game('artifacts', { facts: { goals: [{ id: 'set', title: 'Set', current: 2, total: 4, reward: '30 minutes', missingOwned: 2 }] } });
  assert.equal(selectNextUnlock([spin, artifact])?.id, 'set');
  spin.facts!.goals![0].current = 8;
  assert.equal(selectNextUnlock([spin, artifact])?.id, 'spin');
});
test('no invented goal for zero, completed, unconfigured or unavailable progress', () => {
  for (const current of [0, 4]) assert.equal(selectNextUnlock([game('artifacts', { facts: { goals: [{ id: 'a', title: 'Set', current, total: 4, reward: 'Token' }] } })]), null);
  assert.equal(selectNextUnlock([game('spin', { status: 'disabled', facts: { goals: [{ id: 'a', title: 'Epic', current: 5, total: 10, reward: 'Epic' }] } })]), null);
  assert.equal(selectNextUnlock([game('artifacts', { facts: { goals: [{ id: 'a', title: 'Set', current: 2, total: 4, reward: '' }] } })]), null);
});
test('owned complete sets distinguish needing equipment from needing another artifact', () => {
  const goal = selectNextUnlock([game('artifacts', { facts: { goals: [{ id: 'a', title: 'Set', current: 4, total: 4, reward: 'Token', missingOwned: 0, needsEquipment: true }] } })]);
  assert.equal(goal?.needsEquipment, true);
  assert.equal(goal?.missingOwned, 0);
});
