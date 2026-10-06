import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { classifySmtpFailure, emailConfiguration, lifecycleUnsubscribeSecret, renderLifecycleEmail, signUnsubscribe, verifyUnsubscribe } from '../../lib/lifecycle/email';
const secret = 'a'.repeat(32);
test('unsubscribe tokens use an isolated key and identify only their recipient', () => {
 const identity = { userId: 'player-1', email: 'one@example.com' };
 const derived = lifecycleUnsubscribeSecret(secret);
 const token = signUnsubscribe(identity, derived);
 assert.notEqual(derived, secret);
 assert.deepEqual(verifyUnsubscribe(token, derived), identity);
 assert.equal(verifyUnsubscribe(token + 'x', derived), null);
 assert.equal(verifyUnsubscribe(token, lifecycleUnsubscribeSecret('b'.repeat(32))), null);
 assert.equal(lifecycleUnsubscribeSecret(''), '');
});
test('email escapes account facts and uses absolute links and one-click headers', () => {
 const mail = renderLifecycleEmail({ campaign: 'COMEBACK', subject: 'Ready <again>?', text: '<script>alert(1)</script>\nDaily spin available.', href: '/vault', sourceRefs: [], validUntil: '2026-10-02T00:00:00Z' }, 'https://emiguild.in', 'signed.token');
 assert.ok(!mail.html.includes('<script>'));
 assert.ok(mail.html.includes('&lt;script&gt;'));
 assert.ok(mail.text.includes('https://emiguild.in/vault'));
 assert.ok(mail.headers['List-Unsubscribe'].includes('/api/lifecycle/unsubscribe?'));
 assert.equal(mail.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
});
test('SMTP ambiguity is never reported as acceptance', () => {
 assert.equal(classifySmtpFailure({ command: 'DATA', code: 'ECONNRESET' }).status, 'UNKNOWN');
 assert.equal(classifySmtpFailure({ command: 'AUTH', code: 'EAUTH' }).status, 'FAILED');
 assert.equal(classifySmtpFailure({ responseCode: 450 }).status, 'FAILED');
});
test('sending reuses the existing production mail configuration', () => {
 const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', GMAIL_USER: 'sender', GMAIL_APP_PASSWORD: 'test', AUTH_SECRET: secret };
 assert.deepEqual(emailConfiguration(env), { siteUrl: 'https://emiguild.in', ready: true, enabled: true });
 assert.equal(emailConfiguration({ ...env, NODE_ENV: 'development' }).enabled, false);
 assert.equal(emailConfiguration({ ...env, GMAIL_USER: '' }).enabled, false);
 assert.equal(emailConfiguration({ ...env, GMAIL_APP_PASSWORD: '' }).enabled, false);
 assert.equal(emailConfiguration({ ...env, AUTH_SECRET: '' }).enabled, false);
});
test('lifecycle configuration reuses mail credentials and restores the authenticated schedule', () => {
 const envExample = readFileSync('.env.example', 'utf8');
 const lifecycleSource = [
  'lib/lifecycle/email.ts', 'lib/lifecycle/delivery.ts', 'app/email/unsubscribe/page.tsx',
  'app/api/lifecycle/unsubscribe/route.ts',
 ].map((path) => readFileSync(path, 'utf8')).join('\n');
 for (const key of ['LIFECYCLE_EMAIL_ENABLED', 'LIFECYCLE_SITE_URL', 'LIFECYCLE_UNSUBSCRIBE_SECRET']) {
  assert.equal(envExample.includes(key), false);
  assert.equal(lifecycleSource.includes(key), false);
 }
 assert.equal(readFileSync('vercel.json', 'utf8').includes('/api/cron/lifecycle/email'), true);
});
