import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { getVaultState } from '../../lib/lifecycle/server';
import { ensureArmoryDefaults } from '../../lib/armory';
import { getEffectiveSpinDate } from '../../lib/daily-spin';

const base = process.env.LIFECYCLE_TEST_URL;
// Run only against a disposable database and a dev server using that same database.
test('Vault and lifecycle API integration', { skip: !base }, async (t) => {
  assert.match(process.env.DATABASE_URL ?? '', /^file:.*lifecycle-test/);
  const prefix = `lifecycle-${Date.now()}`;
  const password = 'lifecycle-test-only';
  const hash = await bcrypt.hash(password, 4);
  const first = await prisma.user.create({ data: { name: 'Vault Test Player', email: `${prefix}@example.test`, password: hash, phone: '+919999999999' } });
  const other = await prisma.user.create({ data: { name: 'Other Player', email: `${prefix}-other@example.test`, password: hash } });
  const admin = await prisma.user.create({ data: { name: 'Preview Admin', email: `${prefix}-admin@example.test`, password: hash, role: 'ADMIN' } });
  async function login(email: string) {
    const csrf = await fetch(`${base}/api/auth/csrf`);
    let cookies = csrf.headers.getSetCookie().map((value) => value.split(';')[0]);
    const { csrfToken } = await csrf.json();
    const response = await fetch(`${base}/api/auth/callback/credentials`, {
      method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies.join('; '), 'X-Auth-Return-Redirect': '1' },
      body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${base}/vault` }),
    });
    cookies = [...cookies, ...response.headers.getSetCookie().map((value) => value.split(';')[0])];
    assert.ok(cookies.some((value) => value.startsWith('authjs.session-token=')), `Login failed: ${response.status}`);
    return cookies.join('; ');
  }
  async function api(path: string, cookie = '', options: RequestInit = {}) {
    const response = await fetch(`${base}${path}`, { ...options, headers: { Cookie: cookie, ...options.headers } });
    return { response, body: await response.json() };
  }
  try {
    await ensureArmoryDefaults();
    const [playerCookie, adminCookie] = await Promise.all([login(first.email), login(admin.email)]);
    await t.test('authentication and admin authorization are enforced', async () => {
      for (const path of ['/api/vault']) assert.equal((await api(path)).response.status, 401);
      assert.equal((await api('/api/activity', '', { method: 'POST' })).response.status, 401);
      assert.equal((await api(`/api/admin/lifecycle/preview?userId=${first.id}`, playerCookie)).response.status, 403);
      assert.equal((await api('/api/admin/lifecycle/preview')).response.status, 403);
      const cron = await api('/api/cron/lifecycle/email');
      assert.equal(cron.response.status, 200);
      assert.deepEqual(cron.body, { disabled: true, evaluated: 0, sent: 0 });
    });
    await t.test('authenticated pages render their entry points and unauthenticated Vault redirects', async () => {
      const redirect = await fetch(`${base}/vault`, { redirect: 'manual' });
      assert.ok([302, 303, 307, 308].includes(redirect.status));
      for (const [path, cookie, text] of [
        ['/vault', playerCookie, 'Your Vault'],
        ['/profile', playerCookie, 'Open your Vault'],
        ['/admin/lifecycle', adminCookie, 'Email campaigns'],
      ]) {
        const response = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
        assert.equal(response.status, 200);
        assert.ok((await response.text()).includes(text));
      }
    });
    const now = new Date();
    const expiry = new Date(now.getTime() + 3600000);
    const token = await prisma.towerToken.create({ data: { userId: first.id, expiresAt: expiry } });
    await prisma.towerToken.createMany({ data: [
      { userId: first.id, expiresAt: now }, { userId: first.id, status: 'USED', expiresAt: expiry },
      { userId: other.id, expiresAt: expiry },
    ] });
    const ticket = await prisma.armoryTicket.create({ data: { userId: first.id, code: `${prefix}-ticket`, source: 'TOWER', expiresAt: expiry, rewardSnapshot: JSON.stringify({ rewardType: 'GAMING_TIME', description: '30 minutes gaming', value: 30 }) } });
    await prisma.armoryTicket.create({ data: { userId: first.id, code: `${prefix}-used`, status: 'REDEEMED', expiresAt: expiry, rewardSnapshot: '{}' } });
    await t.test('Vault includes live owned items and excludes expired, used, and other-user items', async () => {
      const result = await api(`/api/vault?userId=${other.id}`, playerCookie);
      assert.equal(result.response.status, 200);
      assert.equal(result.body.userId, first.id);
      assert.deepEqual(result.body.items.filter((row: { kind: string }) => row.kind === 'token').map((row: { sourceRef: string }) => row.sourceRef), [`TowerToken:${token.id}`]);
      assert.deepEqual(result.body.items.filter((row: { kind: string }) => row.kind === 'reward').map((row: { sourceRef: string }) => row.sourceRef), [`ArmoryTicket:${ticket.id}`]);
      assert.ok(result.body.items.some((row: { kind: string }) => row.kind === 'forge'));
      assert.match(result.response.headers.get('cache-control')!, /no-store/);
    });
    await t.test('global settings are admin-only, private, persistent, and never write user consent', async () => {
      await prisma.setting.deleteMany({ where: { key: { in: ['lifecycle_comeback_email', 'lifecycle_email_digest'] } } });
      const path = '/api/admin/lifecycle/settings';
      assert.equal((await api(path)).response.status, 403);
      assert.equal((await api(path, playerCookie)).response.status, 403);
      const options = { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: base! } };
      assert.equal((await api(path, playerCookie, { ...options, body: JSON.stringify({ comebackEmail: true, emailDigest: true }) })).response.status, 403);
      assert.deepEqual((await api(path, adminCookie)).body, { comebackEmail: false, emailDigest: false });
      const before = await prisma.user.findUniqueOrThrow({ where: { id: first.id } });
      assert.equal((await api(path, adminCookie, { ...options, body: JSON.stringify({ comebackEmail: 3, emailDigest: true }) })).response.status, 400);
      const saved = await api(path, adminCookie, { ...options, body: JSON.stringify({ comebackEmail: true, emailDigest: true }) });
      assert.equal(saved.response.status, 200);
      assert.deepEqual((await api(path, adminCookie)).body, { comebackEmail: true, emailDigest: true });
      assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: first.id } }), before);
      assert.equal((await api(path, adminCookie, { ...options, headers: { ...options.headers, Origin: 'https://other.example' }, body: '{}' })).response.status, 403);
      for (const method of ['GET', 'PUT']) assert.equal((await fetch(`${base}/api/profile/communication-preferences`, { method, headers: { Cookie: playerCookie } })).status, 404);
      assert.equal((await api('/api/settings')).body.lifecycle_whatsapp_frequency, undefined);
      const generic = await api('/api/admin/settings', adminCookie);
      assert.ok(!generic.body.settings.some((row: { key: string }) => row.key.startsWith('lifecycle_') || row.key === 'daily_spin_max_retries'));
      for (const key of ['daily_spin_retries_enabled', 'daily_spin_max_retries', 'lifecycle_whatsapp_frequency']) {
        assert.equal((await api('/api/admin/settings', adminCookie, { ...options, body: JSON.stringify([{ key, value: '100' }]) })).response.status, 400);
      }
      for (const route of ['/profile', '/vault']) {
        const response = await fetch(`${base}${route}`, { headers: { Cookie: playerCookie } });
        assert.ok(!(await response.text()).includes('Communication preferences'));
      }
    });
    await t.test('preview is read-only and has no sending side effects', async () => {
      const before = await prisma.user.findMany({ where: { id: { in: [first.id, admin.id] } } });
      const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
      const result = await api(`/api/admin/lifecycle/preview?userId=${first.id}`, adminCookie);
      assert.equal(result.response.status, 200); assert.equal(result.body.deliveryEnabled, false);
      assert.ok(result.body.digest.candidate);
      assert.ok(result.body.digest.suppressionReasons.includes('TRANSPORT_UNAVAILABLE'));
      assert.equal(result.body.whatsapp, undefined);
      assert.equal(await prisma.lifecycleEmailDelivery.count(), 0);
      assert.deepEqual(await prisma.user.findMany({ where: { id: { in: [first.id, admin.id] } } }), before);
      assert.deepEqual(await prisma.setting.findMany({ orderBy: { key: 'asc' } }), settings);
      assert.equal((await api('/api/admin/lifecycle/preview?userId=missing', adminCookie)).response.status, 404);
    });
    await t.test('activity is throttled, scoped to the session, and suppresses previews', async () => {
      await api(`/api/activity?userId=${other.id}`, playerCookie, { method: 'POST' });
      const firstVisit = (await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).lastWebsiteVisitAt;
      assert.ok(firstVisit);
      await api('/api/activity', playerCookie, { method: 'POST' });
      assert.deepEqual((await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).lastWebsiteVisitAt, firstVisit);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).lastWebsiteVisitAt, null);
      const result = await api(`/api/admin/lifecycle/preview?userId=${first.id}`, adminCookie);
      assert.ok(result.body.comeback.suppressionReasons.includes('RECENT_VISIT'));
    });
    await t.test('concurrent daily spins create one immutable reward despite legacy 100 retries', async () => {
      for (const [key, value] of [['daily_spin_retries_enabled', 'true'], ['daily_spin_max_retries', '100']]) {
        await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
      }
      await prisma.lootItem.create({ data: { id: `${prefix}-spin-loot`, name: 'Common test reward', rarity: 'COMMON', weight: 1 } });
      const cookie = await login(other.email);
      const before = await api('/api/daily-spin', cookie);
      assert.equal(before.body.canSpin, true); assert.equal(before.body.remainingRetries, 0);
      const responses = await Promise.all(Array.from({ length: 6 }, () => api('/api/daily-spin', cookie, { method: 'POST' })));
      assert.equal(responses.filter((result) => result.response.status === 200).length, 1);
      assert.equal(responses.filter((result) => result.response.status === 429).length, 5);
      assert.equal(responses.find((result) => result.response.status === 200)!.body.streak.current, 1);
      const persisted = await prisma.userDailySpin.findMany({ where: { userId: other.id } });
      assert.equal(persisted.length, 1); assert.equal(persisted[0].attempts, 1);
      assert.equal((await api('/api/daily-spin', cookie, { method: 'POST' })).response.status, 429);
      assert.deepEqual(await prisma.userDailySpin.findMany({ where: { userId: other.id } }), persisted);
      assert.equal((await api('/api/daily-spin', cookie)).body.canSpin, false);
      const vault = await api('/api/vault', cookie);
      assert.equal(vault.body.games.find((row: { id: string }) => row.id === 'spin').summary, 'Today’s spin used');
    });
    await t.test('disabled games and exhausted attempts do not appear as playable items', async () => {
      await prisma.setting.upsert({ where: { key: 'armory_enabled' }, create: { key: 'armory_enabled', value: 'false', label: 'Test' }, update: { value: 'false' } });
      await prisma.setting.upsert({ where: { key: 'tower_enabled' }, create: { key: 'tower_enabled', value: 'false', label: 'Test' }, update: { value: 'false' } });
      await prisma.lootItem.create({ data: { id: `${prefix}-loot`, name: 'Test reward', weight: 1 } });
      await prisma.userDailySpin.create({ data: { userId: first.id, spinDate: getEffectiveSpinDate().spinDate, attempts: 100 } });
      const state = await getVaultState(first.id);
      assert.equal(state.items.some((row) => ['forge', 'token', 'spin'].includes(row.kind)), false);
      assert.equal(state.items.some((row) => row.kind === 'reward'), true);
      await prisma.armoryTicket.update({ where: { id: ticket.id }, data: { status: 'REDEEMED' } });
      const refreshed = await api('/api/vault', playerCookie);
      assert.deepEqual(refreshed.body.items, []);
      const preview = await api(`/api/admin/lifecycle/preview?userId=${first.id}`, adminCookie);
      assert.equal(preview.body.digest.candidate, null);
      assert.ok(preview.body.digest.suppressionReasons.includes('NO_ELIGIBLE_ITEMS'));
    });
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [first.id, other.id, admin.id] } } });
    await prisma.lootItem.deleteMany({ where: { id: { in: [`${prefix}-loot`, `${prefix}-spin-loot`] } } });
    await prisma.setting.updateMany({ where: { key: { in: ['armory_enabled', 'tower_enabled'] } }, data: { value: 'true' } });
    await prisma.setting.deleteMany({ where: { key: { in: ['lifecycle_comeback_email', 'lifecycle_email_digest', 'daily_spin_retries_enabled', 'daily_spin_max_retries'] } } });
    await prisma.$disconnect();
  }
});
