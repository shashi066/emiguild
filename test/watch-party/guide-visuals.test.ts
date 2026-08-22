import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function guideConstant(source: string, name: string) {
  const start = source.indexOf(`const ${name} = [`);
  const end = source.indexOf('] as const;', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test('gives every Watch Party guide step a lightweight accessible visual', () => {
  const source = readFileSync(new URL('../../components/WatchPartyClient.tsx', import.meta.url), 'utf8');
  const guide = guideConstant(source, 'WATCH_PARTY_GUIDE_STEPS');

  assert.equal(guide.match(/title: '/g)?.length, 5);
  assert.equal(guide.match(/visual: \{ kind: 'icon'/g)?.length, 5);
  for (const icon of ['LogIn', 'TicketCheck', 'Tv', 'Award', 'ShoppingBag']) {
    assert.equal(guide.includes(`icon: ${icon}`), true);
  }
  for (const label of [
    'Watch Party invitation',
    'Counter check-in',
    'Watch Party event',
    'EMIC Rewards',
    'EMIC Reward redemption',
  ]) {
    assert.equal(guide.includes(`label: '${label}'`), true);
  }
});

test('gives every Fan Pick guide step a lightweight accessible visual', () => {
  const source = readFileSync(new URL('../../components/WatchPartyDetailClient.tsx', import.meta.url), 'utf8');
  const guide = guideConstant(source, 'FAN_PICK_GUIDE_STEPS');

  assert.equal(guide.match(/title: '/g)?.length, 6);
  assert.equal(guide.match(/visual: \{ kind: 'icon'/g)?.length, 6);
  for (const icon of ['Tv', 'Coins', 'Trophy', 'Lock', 'CheckCircle2', 'Award']) {
    assert.equal(guide.includes(`icon: ${icon}`), true);
  }
  for (const label of [
    'Open Fan Picks',
    'Selected EMIC amount',
    'Potential Fan Pick reward',
    'Confirmed Fan Pick',
    'Official Fan Pick result',
    'In-app EMIC Rewards',
  ]) {
    assert.equal(guide.includes(`label: '${label}'`), true);
  }
});

test('keeps guide visuals optional for shared fallback rows', () => {
  const source = readFileSync(new URL('../../components/InfoGuideModal.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('visual?: InfoGuideStepVisual'), true);
  assert.equal(source.includes("className={step.visual ? 'has-visual' : undefined}"), true);
  assert.equal(source.includes('{step.visual && ('), true);
});
