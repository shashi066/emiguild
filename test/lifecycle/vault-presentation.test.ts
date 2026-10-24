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

test('live Guild Drop is first preference, including before secured rewards and daily actions', () => {
  const drop = game('guild-drop', { facts: { liveDrops: [{ id: 'live', title: 'Live drop', endsAt: '2026-10-01T16:00:00Z' }] } });
  assert.equal(selectVaultAction([game('tower', { facts: { canClaim: true } }), game('spin'), drop], now)?.game.id, 'guild-drop');
  assert.equal(selectVaultAction([drop], now)?.label, 'Enter a live Guild Drop');
});
test('expired, paused, failed or result-only drops never take primary priority', () => {
  for (const drop of [game('guild-drop', { facts: { liveDrops: [{ id: 'old', title: 'Expired', endsAt: now.toISOString() }] } }), game('guild-drop', { status: 'active', facts: { events: [{ id: 'entry', title: 'Pending result', participation: 'Awaiting result' }] } }), ...(['disabled', 'error'] as const).map(status => game('guild-drop', { status, facts: { liveDrops: [{ id: 'live', title: 'Live' }] } }))]) {
    assert.equal(selectVaultAction([drop, game('spin')], now)?.game.id, 'spin');
  }
});
test('an unentered live drop without an end time still takes priority', () => {
  const drop = game('guild-drop', { deadline: undefined, facts: { liveDrops: [{ id: 'live', title: 'Open draw' }] } });
  assert.equal(selectVaultAction([game('guess36'), drop], now)?.game.id, 'guild-drop');
});
test('one expired drop cannot hide another live drop behind a stale card deadline', () => {
  const drop = game('guild-drop', { deadline: { at: now.toISOString(), label: 'Old deadline' }, facts: { liveDrops: [
    { id: 'old', title: 'Expired', endsAt: now.toISOString() },
    { id: 'new', title: 'Still live', endsAt: '2026-10-01T15:00:00Z' },
  ] } });
  assert.equal(selectVaultAction([drop], now)?.game.deadline?.at, '2026-10-01T15:00:00Z');
});
