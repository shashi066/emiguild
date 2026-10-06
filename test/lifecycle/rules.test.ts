import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateLifecycle, digestPeriod, DAY, formatEndOfDay, hasUsableEmail, orderVaultItems, VaultItem, EvaluationInput } from '../../lib/lifecycle/rules';
import { calculateCurrentStreak, getEffectiveSpinDate, getSpinAvailability } from '../../lib/daily-spin';
import { getForgeConfigurationError } from '../../lib/armory';
import { isSameOrigin } from '../../lib/lifecycle/http';
const now = new Date('2026-10-04T12:30:00Z');
function item(kind: VaultItem['kind'], hours: number): VaultItem {
  return { id: kind, kind, sourceRef: 'source:' + kind, title: kind === 'forge' ? 'Daily forge available' : kind,
    description: kind === 'forge' ? 'Forge today to discover an artifact.' : 'Available in your account.', href: '/vault', action: 'View',
    validUntil: new Date(now.getTime() + hours * 3600000).toISOString(), expires: kind === 'reward' || kind === 'token' };
}
function evaluate(overrides: Partial<EvaluationInput> = {}) {
  return evaluateLifecycle({ state: { userId: 'player', evaluatedAt: now.toISOString(), items: [item('forge', 8), item('reward', 48), item('token', 4)], games: [
    { id: 'spin', title: 'Spin', status: 'available', summary: '', details: [], href: '/daily-spin', action: 'Spin', facts: { dailyAvailable: true }, deadline: { at: new Date(now.getTime() + 6 * 3600000).toISOString(), label: 'Reset' } },
    { id: 'artifacts', title: 'Forge', status: 'available', summary: '', details: [], href: '/armory', action: 'Forge', facts: { dailyAvailable: true }, deadline: { at: new Date(now.getTime() + 6 * 3600000).toISOString(), label: 'Reset' } },
    { id: 'guess36', title: 'Guess 36', status: 'available', summary: '', details: [], href: '/guess-36', action: 'Enter', deadline: { at: new Date(now.getTime() + 5 * 3600000).toISOString(), label: 'Entries close' } },
  ] }, settings: { emailDigest: true, comebackEmail: true }, email: 'player@example.test', unsubscribed: false,
    createdAt: new Date(now.getTime() - 10 * DAY).toISOString(), lastWebsiteVisitAt: null, now, history: [], nextComebackCheckAt: null, transportAvailable: true,
    activity: { start: new Date(now.getTime() - 3 * DAY).toISOString(), end: now.toISOString(), spin: 0, forge: 0, guess36: 0, reliable: true, featuresEnabled: true }, ...overrides });
}
test('comeback wins when both campaigns are eligible and copy promises only opportunities', () => {
  const result = evaluate();
  assert.equal(result.selected, 'COMEBACK');
  assert.equal(result.digest.candidate?.sourceRefs.length, 3);
  assert.equal(result.comeback.candidate?.subject, 'Your next EmiGuild move is ready');
  assert.match(result.comeback.candidate!.text, /Discover an artifact/);
  assert.match(result.comeback.candidate!.text, /end of day/);
  assert.doesNotMatch(result.comeback.candidate!.text, /\d{1,2}:\d{2}|IST/);
  assert.doesNotMatch(result.comeback.candidate!.text, /deposited|free reward|you won|missed prize/);
  assert.deepEqual(orderVaultItems([item('reward', 0), item('forge', 8), item('token', 4)], now).map((row) => row.kind), ['token', 'forge']);
});
test('email deadlines use dates and describe midnight cutoffs as the preceding end of day', () => {
  assert.equal(formatEndOfDay('2026-10-01T18:30:00.000Z'), '1 Oct 2026 (end of day)');
  const result = evaluate();
  assert.equal(result.digest.candidate?.subject, 'Your Vault has something for you');
  assert.match(result.digest.candidate!.text, /^Don’t leave these behind\./);
  assert.doesNotMatch(result.digest.candidate!.text, /\d{1,2}:\d{2}|IST/);
});
test('any single activity suppresses comeback but still permits a digest', () => {
  for (const key of ['spin', 'forge', 'guess36'] as const) {
    const result = evaluate({ activity: { ...evaluate().activity, [key]: 1 } });
    assert.ok(result.comeback.suppressionReasons.includes('ACTIVITY_FOUND'));
    assert.equal(result.selected, 'DIGEST');
  }
});
test('comeback needs a mature account, enabled games and reliable history', () => {
  assert.ok(evaluate({ createdAt: new Date(now.getTime() - 3 * DAY + 1).toISOString() }).comeback.suppressionReasons.includes('ACCOUNT_TOO_NEW'));
  assert.equal(evaluate({ createdAt: new Date(now.getTime() - 3 * DAY).toISOString() }).comeback.eligible, true);
  assert.ok(evaluate({ activity: { ...evaluate().activity, reliable: false } }).comeback.suppressionReasons.includes('HISTORY_UNAVAILABLE'));
  assert.ok(evaluate({ activity: { ...evaluate().activity, featuresEnabled: false } }).comeback.suppressionReasons.includes('FEATURE_DISABLED'));
});
test('72-hour visit cooldown stops at the exact boundary', () => {
  assert.equal(evaluate({ lastWebsiteVisitAt: new Date(now.getTime() - 3 * DAY + 1).toISOString() }).digest.eligible, false);
  assert.equal(evaluate({ lastWebsiteVisitAt: new Date(now.getTime() - 3 * DAY).toISOString() }).digest.eligible, true);
});
test('both campaigns share a rolling seven-day cap; failed and old sends do not count', () => {
  for (const campaign of ['COMEBACK', 'DIGEST'] as const) for (const status of ['ACCEPTED', 'UNKNOWN']) {
    const result = evaluate({ history: [{ campaign, status, at: now.toISOString() }] });
    assert.ok(result.digest.suppressionReasons.includes('FREQUENCY_CAP'));
    assert.ok(result.comeback.suppressionReasons.includes('FREQUENCY_CAP'));
  }
  for (const status of ['ACCEPTED', 'FAILED']) assert.equal(evaluate({ history: [{ campaign: 'DIGEST', status, at: new Date(now.getTime() - 7 * DAY).toISOString() }] }).comeback.eligible, true);
  assert.equal(evaluate({ history: [{ campaign: 'DIGEST', status: 'FAILED', at: now.toISOString() }] }).comeback.eligible, true);
  assert.ok(evaluate({ history: [{ campaign: 'DIGEST', status: 'SENDING', at: now.toISOString() }] }).digest.suppressionReasons.includes('PENDING_DELIVERY'));
});
test('unsubscribed, invalid-address and unconfigured transport recipients are suppressed', () => {
  for (const [override, reason] of [[{ unsubscribed: true }, 'UNSUBSCRIBED'], [{ email: 'invalid' }, 'CHANNEL_UNAVAILABLE'], [{ transportAvailable: false }, 'TRANSPORT_UNAVAILABLE']] as const) {
    const result = evaluate(override);
    assert.ok(result.digest.suppressionReasons.includes(reason)); assert.ok(result.comeback.suppressionReasons.includes(reason));
  }
  assert.equal(hasUsableEmail('player@example.test'), true); assert.equal(hasUsableEmail('missing-address'), false);
});
test('three-day next-check boundary is respected without mutating input', () => {
  assert.ok(evaluate({ nextComebackCheckAt: new Date(now.getTime() + 1).toISOString() }).comeback.suppressionReasons.includes('CHECK_NOT_DUE'));
  assert.equal(evaluate({ nextComebackCheckAt: now.toISOString() }).comeback.eligible, true);
});
test('empty digests and expired opportunities produce no email', () => {
  const result = evaluate({ state: { userId: 'x', evaluatedAt: now.toISOString(), games: [], items: [item('reward', 0)] } });
  assert.equal(result.digest.candidate, null); assert.equal(result.comeback.candidate, null); assert.equal(result.selected, null);
});
test('global campaign switches independently control eligibility', () => {
  assert.equal(evaluate({ settings: { emailDigest: true, comebackEmail: false } }).selected, 'DIGEST');
  assert.equal(evaluate({ settings: { emailDigest: false, comebackEmail: true } }).selected, 'COMEBACK');
  assert.equal(evaluate({ settings: { emailDigest: false, comebackEmail: false } }).selected, null);
});
test('Sunday 18:00 India digest boundary switches at 12:30 UTC', () => {
  assert.equal(digestPeriod(new Date('2026-10-04T12:29:59Z')).toISOString(), '2026-09-27T12:30:00.000Z');
  assert.equal(digestPeriod(new Date('2026-10-04T12:30:00Z')).toISOString(), '2026-10-04T12:30:00.000Z');
});
test('daily spin ignores legacy retries and grants only one daily attempt', () => {
  const settings = { enabled: true, retriesEnabled: true, maxRetries: 100 };
  assert.equal(getSpinAvailability(settings, null).remainingAttempts, 1);
  assert.equal(getSpinAvailability(settings, { attempts: 1 }).remainingAttempts, 0);
  assert.equal(getSpinAvailability(settings, { attempts: 3 }).canSpin, false);
  assert.equal(getSpinAvailability({ ...settings, enabled: false }, null).canSpin, false);
  assert.equal(getSpinAvailability({ ...settings, retriesEnabled: false }, { attempts: 1 }).canSpin, false);
});
test('spin reset respects IST and configured hour on either side of reset', () => {
  assert.deepEqual(getEffectiveSpinDate(4, new Date('2026-09-30T22:29:59Z')), { spinDate: '2026-09-30', nextReset: new Date('2026-09-30T22:30:00Z') });
  assert.equal(getEffectiveSpinDate(4, new Date('2026-09-30T22:30:00Z')).spinDate, '2026-10-01');
  assert.equal(getEffectiveSpinDate(0, new Date('2026-09-30T18:30:00Z')).spinDate, '2026-10-01');
});
test('streak breaks on gaps and epic/legendary rewards', () => {
  const rows = [{ spinDate: '2026-09-29', lootItem: { rarity: 'COMMON' } }, { spinDate: '2026-09-28', lootItem: { rarity: 'EPIC' } }];
  assert.equal(calculateCurrentStreak(rows, '2026-09-30'), 1);
  assert.equal(calculateCurrentStreak(rows, '2026-10-01'), 0);
});
test('forge availability uses executable configuration rules', () => {
  assert.equal(getForgeConfigurationError({ enabled: false, sets: [] }), 'ARMORY_DISABLED');
  assert.equal(getForgeConfigurationError({ enabled: true, sets: [] }), 'NO_ARTIFACTS');
  assert.equal(getForgeConfigurationError({ enabled: true, sets: [{ dropPercentage: 100, artifacts: [{ setId: 'set', slotDropPercentage: 100 }] }] }), null);
  assert.equal(getForgeConfigurationError({ enabled: true, sets: [{ dropPercentage: 90, artifacts: [{ setId: 'set', slotDropPercentage: 100 }] }] }), 'BAD_DROP_TOTAL');
});
test('activity writes reject cross-origin requests', () => {
  assert.equal(isSameOrigin(new Request('http://localhost/api/activity')), false);
  assert.equal(isSameOrigin(new Request('http://localhost/api/activity', { headers: { origin: 'https://other.example' } })), false);
  assert.equal(isSameOrigin(new Request('http://localhost/api/activity', { headers: { origin: 'http://localhost' } })), true);
});
