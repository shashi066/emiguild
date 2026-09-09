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
  assert.equal(source.includes('grid-template-columns: 52px minmax(0, 1fr)'), true);
  assert.equal(source.includes('grid-template-columns: 48px minmax(0, 1fr)'), true);
  assert.equal(source.includes('.info-guide-steps li.has-visual .info-guide-step-number {\n          position: absolute;'), true);
  assert.equal(source.includes('<span className="info-guide-step-number" aria-hidden="true">{index + 1}</span>\n                    {StepIcon'), true);
});

test('shares one compact Info control and keeps the Rewards shortcut on the Watch Party list', () => {
  const trigger = readFileSync(new URL('../../components/InfoGuideButton.tsx', import.meta.url), 'utf8');
  const rewards = readFileSync(new URL('../../components/EmicRewardsButton.tsx', import.meta.url), 'utf8');
  const list = readFileSync(new URL('../../components/WatchPartyClient.tsx', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../../components/WatchPartyDetailClient.tsx', import.meta.url), 'utf8');
  const tower = readFileSync(new URL('../../components/TowerClient.tsx', import.meta.url), 'utf8');
  const guess = readFileSync(new URL('../../components/Guess36Client.tsx', import.meta.url), 'utf8');
  const armory = readFileSync(new URL('../../components/ArmoryClient.tsx', import.meta.url), 'utf8');

  assert.equal(trigger.includes('min-height: 36px'), true);
  assert.equal(trigger.includes('border-radius: 6px'), true);
  for (const source of [list, detail, tower, guess, armory]) assert.equal(source.includes('<InfoGuideButton'), true);
  assert.equal(list.includes('<EmicRewardsButton />'), true);
  assert.equal(rewards.includes('href="/rewards"'), true);
  assert.equal(rewards.includes('Open EMIC Rewards shop'), true);
  assert.equal(rewards.includes('background: #33260b'), true);
  assert.equal(detail.includes('<EmicRewardsButton'), false);
});
