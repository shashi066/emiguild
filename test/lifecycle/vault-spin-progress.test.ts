import test from 'node:test';
import assert from 'node:assert/strict';
import { vaultLegendaryDisplay } from '../../lib/vault-spin-progress';
import { selectNextUnlock } from '../../lib/lifecycle/vault-presentation';
import type { GameProgress } from '../../lib/lifecycle/rules';

test('compact Legendary progress uses actual counts and next-spin readiness', () => {
  for (const current of [0, 1, 20, 21, 28, 29]) {
    const result = vaultLegendaryDisplay({ enabled: true, current, target: 30, spinsRemaining: 30 - current })!;
    assert.equal(result.current, current);
    assert.equal(result.remaining, 30 - current);
    assert.equal(result.label, current === 29 ? 'Legendary on your next eligible spin.' : `${30 - current} days left`);
    assert.equal(result.width, `${current / 30 * 100}%`);
  }
});

test('disabled Legendary falls back; committed Legendary and missed days show reset counts', () => {
  assert.equal(vaultLegendaryDisplay(), null);
  assert.equal(vaultLegendaryDisplay({ enabled: false, current: 19, target: 30, spinsRemaining: 11 }), null);
  assert.equal(vaultLegendaryDisplay({ enabled: true, current: 0, target: 30, spinsRemaining: 30 })?.label, '30 days left');
});

test('Legendary competes with artifact goals without changing next-unlock ranking', () => {
  const base = { status: 'available' as const, summary: '', details: [], href: '/', action: 'View' };
  const spin: GameProgress = { ...base, id: 'spin', title: 'Spin', facts: { goals: [{ id: 'spin-legendary', title: 'Legendary', current: 29, total: 30, reward: 'Legendary reward' }] } };
  const artifacts: GameProgress = { ...base, id: 'artifacts', title: 'Artifacts', facts: { goals: [{ id: 'set', title: 'Set', current: 3, total: 4, reward: 'Set reward' }] } };
  assert.equal(selectNextUnlock([spin, artifacts])?.id, 'spin-legendary');
  spin.facts!.goals![0].current = 20;
  assert.equal(selectNextUnlock([spin, artifacts])?.id, 'set');
});
