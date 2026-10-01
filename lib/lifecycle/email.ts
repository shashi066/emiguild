import { createHmac, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { MessageCandidate } from './rules';

export const SITE_URL = 'https://emiguild.in';
const UNSUBSCRIBE_KEY_CONTEXT = 'emiguild:lifecycle:unsubscribe:v1';

export function emailConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const ready = !!(env.GMAIL_USER && env.GMAIL_APP_PASSWORD && env.AUTH_SECRET);
  return { siteUrl: SITE_URL, ready, enabled: ready && env.NODE_ENV === 'production' };
}
export type UnsubscribeIdentity = { userId: string; email: string };
export function lifecycleUnsubscribeSecret(authSecret: string | undefined = process.env.AUTH_SECRET) {
  if (!authSecret) return '';
  return createHmac('sha256', authSecret).update(UNSUBSCRIBE_KEY_CONTEXT).digest('base64url');
}
export function signUnsubscribe(identity: UnsubscribeIdentity, secret: string) {
  if (secret.length < 32) throw new Error('UNSUBSCRIBE_NOT_CONFIGURED');
  const body = Buffer.from(JSON.stringify(identity)).toString('base64url');
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
}
export function verifyUnsubscribe(token: string, secret: string): UnsubscribeIdentity | null {
  if (secret.length < 32 || token.length > 2048) return null;
  try {
    const [body, supplied, extra] = token.split('.');
    if (!body || !supplied || extra) return null;
    const expected = createHmac('sha256', secret).update(body).digest();
    const actual = Buffer.from(supplied, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const value = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof value.userId === 'string' && typeof value.email === 'string' ? value : null;
  } catch { return null; }
}
export function escapeEmail(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}
export function renderLifecycleEmail(candidate: MessageCandidate, siteUrl: string, token: string) {
  const vaultUrl = siteUrl + '/vault';
  const unsubscribeUrl = siteUrl + '/email/unsubscribe?token=' + encodeURIComponent(token);
  const oneClickUrl = siteUrl + '/api/lifecycle/unsubscribe?token=' + encodeURIComponent(token);
  const subject = candidate.subject;
  const text = subject + '\n\n' + candidate.text + '\n\nVisit your Vault: ' + vaultUrl + '\n\nStop lifecycle emails: ' + unsubscribeUrl;
  const html = '<!doctype html><html><body style="margin:0;background:#080b14;color:#f0f4ff;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:28px 20px">'
    + '<p style="color:#bca7ff;font-weight:bold">EmiGuild</p><h1 style="font-size:24px;line-height:1.4">' + escapeEmail(subject) + '</h1>'
    + '<div style="line-height:1.7;color:#c4cce0">' + candidate.text.split('\n').filter(Boolean).map((line) => '<p>' + escapeEmail(line) + '</p>').join('') + '</div>'
    + '<p><a href="' + escapeEmail(vaultUrl) + '" style="display:inline-block;padding:14px 20px;border-radius:10px;background:#6c63ff;color:white;text-decoration:none;font-weight:bold">Visit your Vault</a></p>'
    + '<p style="font-size:12px;color:#b4bfd9">An update from your EmiGuild account. <a style="color:#bca7ff" href="' + escapeEmail(unsubscribeUrl) + '">Stop lifecycle emails</a></p></div></body></html>';
  return { subject, text, html, headers: { 'List-Unsubscribe': '<' + oneClickUrl + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}
export type LifecycleMail = ReturnType<typeof renderLifecycleEmail> & { to: string; messageId: string };
export type MailResult = { status: 'ACCEPTED' | 'FAILED' | 'UNKNOWN'; code?: string; retryable?: boolean };
export type MailTransport = (mail: LifecycleMail) => Promise<MailResult>;
export function classifySmtpFailure(error: unknown): MailResult {
  const value = error as { code?: string; command?: string; responseCode?: number };
  // A lost connection while/after DATA has an ambiguous outcome. Never resend it.
  const preData = ['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH', 'MAIL FROM', 'RCPT TO'].includes(value.command ?? '');
  const rejected = typeof value.responseCode === 'number' && value.responseCode >= 400;
  if (preData || rejected) return { status: 'FAILED', code: value.code === 'EAUTH' ? 'SMTP_AUTH' : rejected ? 'SMTP_REJECTED_' + value.responseCode : 'SMTP_CONNECTION', retryable: value.code !== 'EAUTH' && (!rejected || value.responseCode! < 500) };
  return { status: 'UNKNOWN', code: 'SMTP_ACCEPTANCE_UNKNOWN' };
}
export const gmailLifecycleTransport: MailTransport = async (mail) => {
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  try {
    const result = await transporter.sendMail({ ...mail, from: '"EmiGuild" <' + process.env.GMAIL_USER + '>' });
    return result.accepted?.some((address) => String(address).toLowerCase() === mail.to.toLowerCase()) ? { status: 'ACCEPTED' } : { status: 'FAILED', code: 'SMTP_RECIPIENT_REJECTED', retryable: false };
  } catch (error) { return classifySmtpFailure(error); }
  finally { transporter.close(); }
};
