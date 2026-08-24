import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('gives every Artifacts guide step a lightweight accessible visual', () => {
  const source = readFileSync(new URL('../../components/ArmoryClient.tsx', import.meta.url), 'utf8');
  const modalStart = source.indexOf('function ArtifactGuideModal');
  const start = source.indexOf('const steps = [', modalStart);
  const end = source.indexOf('  ];', start);
  const guide = source.slice(start, end);

  assert.notEqual(modalStart, -1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.equal(guide.match(/title: '/g)?.length, 5);
  assert.equal(guide.match(/visual: \{ kind: 'icon'/g)?.length, 5);
  for (const icon of ['Sparkles', 'Package', 'Shield', 'Ticket', 'Store']) {
    assert.equal(guide.includes(`icon: ${icon}`), true);
  }
  for (const label of [
    'Forge artifact',
    'Matching artifact set',
    'Equipped artifact set',
    'Artifact Reward Ticket',
    'Artifact crafting and exchange',
  ]) {
    assert.equal(guide.includes(`label: '${label}'`), true);
  }
});
