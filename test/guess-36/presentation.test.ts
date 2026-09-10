import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { getGuess36RewardTicketDisplay, getTowerRewardTicketDisplay } from '../../lib/reward-ticket';

const client = readFileSync('components/Guess36Client.tsx', 'utf8');
const service = readFileSync('lib/guess-36.ts', 'utf8');
const sideQuests = readFileSync('components/layout/SideQuestsMenu.tsx', 'utf8');
const rewardsButton = readFileSync('components/EmicRewardsButton.tsx', 'utf8');

test('Guess 36 routes, schema, settings, and ticket source share the new namespace', () => {
  for (const path of ['app/guess-36/page.tsx', 'app/admin/guess-36/page.tsx', 'app/api/guess-36/current/route.ts', 'app/api/admin/guess-36/config/route.ts', 'app/api/cron/guess-36/draw/route.ts']) assert.ok(existsSync(path), path);
  for (const path of ['app/emi-36/page.tsx', 'app/lucky-hour/page.tsx', 'app/admin/lucky-hour/page.tsx', 'app/api/lucky-hour/current/route.ts', 'app/api/admin/lucky-hour/config/route.ts', 'app/api/cron/lucky-hour/draw/route.ts']) assert.equal(existsSync(path), false, path);
  const admin = readFileSync('components/admin/AdminGuess36.tsx', 'utf8');
  assert.doesNotMatch(client + admin + service, /Lucky Number|EMI 36|lucky.?hour|LUCKY_HOUR|LuckyHour/);
  assert.ok(client.includes('Guess 36 result'));
  assert.ok(service.includes("const TICKET_SOURCE = 'GUESS_36'"));
  assert.ok(service.includes('`G36-${crypto.randomBytes'));
  for (const path of ['prisma/schema.prisma', 'prisma/schema.production.prisma']) {
    const schema = readFileSync(path, 'utf8');
    assert.ok(schema.includes('model Guess36Round'));
    assert.ok(schema.includes('model Guess36Entry'));
    assert.ok(schema.includes('@@map("guess_36_rounds")'));
    assert.ok(schema.includes('@@map("guess_36_entries")'));
    assert.doesNotMatch(schema, /LuckyHour|lucky_hour/);
  }
  const migration = readFileSync('prisma/migrations/20260904000000_add_guess_36/migration.sql', 'utf8');
  assert.doesNotMatch(migration, /lucky_hour|Lucky Hour/);
  assert.ok(migration.includes('guess_36_entries_roundId_userId_key'));
  assert.ok(migration.includes('guess_36_rewards'));
  for (const path of ['app/api/settings/route.ts', 'app/api/admin/settings/route.ts']) {
    const route = readFileSync(path, 'utf8');
    assert.ok(route.includes('guess_36_rewards'));
    assert.ok(route.includes('guess_36_enabled'));
    assert.ok(route.includes('guess_36_modes'));
  }
  assert.equal(JSON.parse(readFileSync('vercel.json', 'utf8')).crons[0].path, '/api/cron/guess-36/draw');
  const cron = readFileSync('app/api/cron/guess-36/draw/route.ts', 'utf8');
  assert.equal(cron.includes('CRON_SECRET'), false);
  assert.equal(readFileSync('.env.example', 'utf8').includes('CRON_SECRET'), false);
  assert.ok(cron.includes('getPreviousIstDateKey(now)'));
});

test('renders the mobile six-column picker and irreversible confirmation', () => {
  assert.ok(client.includes('type PickMode = Guess36Mode;'));
  assert.equal(client.includes("label: 'Row'"), false);
  assert.equal(client.includes('grid-template-columns: repeat(6'), true);
  assert.equal(client.includes('Change Pick'), false);
  assert.equal(client.includes('1 in 36 chance'), false);
  assert.equal(client.includes('{chance} chance'), false);
  assert.equal(client.includes('if (selection || submitting)'), false);
  assert.equal(client.includes('setMode(item.id); setSelection(null)'), true);
  assert.equal(client.includes('Confirm Your Pick'), true);
  assert.equal(client.includes('Lock In My Pick'), true);
  assert.equal(client.includes('Continue</button>'), false);
  assert.equal(client.includes('cannot be changed'), true);
  assert.equal(client.includes('min-height: 49px'), true);
  assert.equal(client.includes('aria-pressed={selected}'), true);
  assert.equal(client.includes('guess-36-group-number-table'), true);
  assert.equal(client.includes('guess-36-group-design-option'), false);
  for (const trial of ['Number Bands', 'Round Markers', 'Clean Lines', 'Number Capsules']) assert.equal(client.includes(trial), false);
  assert.equal(/\.guess-36-number-grid button\s*\{[\s\S]*overflow:\s*hidden;/.test(client), true);
});

test('admin controls visible pick types and the player uses the configured tabs', () => {
  const admin = readFileSync('components/admin/AdminGuess36.tsx', 'utf8');
  const rules = readFileSync('lib/guess-36-rules.ts', 'utf8');
  assert.ok(admin.includes('Visible Pick Types'));
  assert.ok(admin.includes('Choose Pick Types'));
  assert.ok(admin.includes('Keep at least one pick type enabled.'));
  assert.ok(admin.includes("saveConfig('modes')"));
  assert.ok(client.includes('state.enabledModes.includes(item.id)'));
  assert.ok(client.includes('repeat(${state.enabledModes.length}'));
  assert.ok(service.includes("throw new Guess36Error('MODE_DISABLED', 409)"));
  assert.ok(rules.includes('normalizeGuess36Modes'));
});

test('keeps Guess 36 lightweight and discoverable through Side Quests', () => {
  assert.equal(sideQuests.includes("href: '/guess-36'"), true);
  assert.equal(client.includes('/login?callbackUrl=/guess-36'), true);
  assert.equal(sideQuests.includes("title: 'Guess 36'"), true);
  assert.equal(sideQuests.includes('icon: Target'), true);
  assert.equal(client.includes('setInterval'), false);
  assert.equal((client.match(/window\.setTimeout/g) ?? []).length, 1);
  assert.equal(client.includes('localStorage'), false);
  assert.equal(client.includes('framer-motion'), false);
  assert.equal(client.includes('canvas'), false);
  assert.equal(client.includes('guess-36-preview-number'), false);
  assert.equal(client.includes('<RewardTicketCard'), true);
  assert.equal(client.includes('guess-36-code-row'), false);
  assert.ok(client.includes('<EmicRewardsButton />'));
  assert.ok(rewardsButton.includes('href="/rewards"'));
  assert.ok(client.includes('<EmicoinAmount value={reward.value}'));
});

test('public serialization is explicit and excludes private round internals', () => {
  const publicFunction = service.slice(service.indexOf('export async function getGuess36Current'), service.indexOf('export async function createGuess36Entry'));
  assert.equal(publicFunction.includes('phone: true'), false);
  assert.equal(publicFunction.includes('sourceRefId: true'), false);
  assert.equal(publicFunction.includes('code: true'), false);
  assert.equal(publicFunction.includes('winnerFirstNames'), false);
  assert.equal(publicFunction.includes('winnerCount'), false);
  assert.equal(publicFunction.includes('select: { user:'), false);
});

test('six numbered visual guide steps describe Guess 36 rules without Tower rules', () => {
  const guide = client.slice(client.indexOf('const GUIDE_STEPS'), client.indexOf('type Guess36ClientProps'));
  assert.equal((guide.match(/visual: \{ kind: 'icon'/g) ?? []).length, 6);
  for (const title of ['Choose your pick type', 'See your numbers', 'Compare the reward', 'Confirm your daily pick', 'Check the next result', 'Receive your reward']) assert.ok(guide.includes(title));
  for (const text of ['before confirming', 'at midnight', 'do not change', 'expiry']) assert.ok(guide.includes(text));
  assert.equal(guide.includes('IST'), false);
  assert.ok(guide.includes('go directly to your wallet'));
  assert.equal(/120|Tower Token|climb/.test(guide), false);
  assert.ok(client.includes('guideStepsForModes(state.enabledModes)'));
  assert.ok(guide.includes('Only available pick types appear here.'));
  const guideModal = readFileSync('components/InfoGuideModal.tsx', 'utf8');
  assert.ok(guideModal.includes('lightweight = false'));
});

test('Guess 36 and Tower share reward presentation without changing Tower origin or ticket snapshots', () => {
  const common = { id: 'ticket', expiresAt: '2026-09-06T18:30:00.000Z' };
  for (const [type, value, kind] of [['GAMING_TIME', 60, 'gaming'], ['RACING_TIME', 30, 'racing'], ['DISCOUNT', 10, 'discount']] as const) {
    const ticket = { ...common, reward: { type, value, name: 'Stored reward name' } };
    const guess = getGuess36RewardTicketDisplay(ticket);
    const tower = getTowerRewardTicketDisplay(ticket);
    assert.deepEqual(guess, { ...tower, origin: 'Guess 36' });
    assert.equal(tower.origin, 'Tower of Rewards');
    assert.equal(guess.kind, kind);
    assert.equal(guess.description, 'Stored reward name');
    assert.match(guess.expiry, /7 Sept?, 12:00 am/);
  }
  const pass = getGuess36RewardTicketDisplay({ ...common, reward: { type: 'PASS', name: 'Weekend Hero Pass' } });
  assert.equal(pass.kind, 'pass');
  assert.equal(pass.value, 'Weekend Hero Pass');
});
