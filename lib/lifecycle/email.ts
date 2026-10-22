import { createHmac, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { DAY, MessageCandidate, presentationText } from './rules';

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
  const presentation = candidate.presentation;
  const bodyText = presentation ? presentationText(presentation) : candidate.text;
  const text = subject + '\n\n' + bodyText + '\n\nVisit your Vault: ' + vaultUrl + '\n\nUnsubscribe from game updates: ' + unsubscribeUrl;
  const paragraph = (value: string) => '<p style="margin:0 0 16px;line-height:1.65;color:#d1d5db;font-size:15px">' + escapeEmail(value) + '</p>';
  const content = presentation
    ? paragraph(presentation.intro)
      + presentation.cards.map((card) => '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px;border:1px solid #2d2d4e;border-radius:8px;background:#171727"><tr><td style="padding:16px;overflow-wrap:anywhere">'
        + '<h2 style="margin:0 0 6px;font-size:16px;line-height:1.4;color:#e5e7eb">' + escapeEmail(card.title) + '</h2>'
        + '<p style="margin:0;font-size:15px;line-height:1.6;color:#d1d5db">' + escapeEmail(card.description) + '</p>'
        + (card.deadline ? '<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:#b4b9c7">' + escapeEmail(card.deadline) + '</p>' : '')
        + '</td></tr></table>').join('')
      + presentation.deadlineNotes.map((note) => '<p style="margin:12px 0;font-size:12px;line-height:1.6;color:#b4b9c7">' + escapeEmail(note) + '</p>').join('')
      + (presentation.moreNote ? paragraph(presentation.moreNote) : '')
    : candidate.text.split('\n').filter(Boolean).map(paragraph).join('');
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;padding:16px 8px;background:#0a0a14;font-family:Arial,sans-serif;color:#e5e7eb">'
    + '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">' + escapeEmail(presentation?.preview ?? candidate.subject) + '</div>'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#0f0f1a;border:1px solid #2d2d4e;border-radius:12px;overflow:hidden;table-layout:fixed">'
    + '<tr><td style="background:#6c63ff;background:linear-gradient(135deg,#6c63ff,#00e676);padding:24px;text-align:center">'
    + '<img src="' + escapeEmail(siteUrl + '/images/logoImage.png') + '" alt="EMI Guild" width="64" height="56" style="display:block;margin:0 auto 12px;object-fit:contain">'
    + '<h1 style="margin:0;font-size:24px;line-height:1.3;color:#fff;font-weight:800;overflow-wrap:anywhere">' + escapeEmail(presentation?.heading ?? subject) + '</h1></td></tr>'
    + '<tr><td style="padding:24px;overflow-wrap:anywhere">' + content
    + '<p style="margin:24px 0 0;text-align:center"><a href="' + escapeEmail(vaultUrl) + '" style="display:inline-block;padding:14px 24px;background:#00e676;color:#0b0b12;text-decoration:none;border-radius:6px;font-size:15px;line-height:1.5;font-weight:800">' + escapeEmail(presentation?.buttonLabel ?? 'OPEN MY VAULT') + '</a></p></td></tr>'
    + '<tr><td style="padding:20px 24px;background:#0a0a14;text-align:center;font-size:12px;line-height:1.7;color:#b4b9c7">Game updates from EMI Guild.<br><a href="' + escapeEmail(unsubscribeUrl) + '" style="color:#c4b5fd">Unsubscribe from game updates</a></td></tr></table></body></html>';
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

export function createAdminTestCandidate(now: Date): MessageCandidate {
  return {
    campaign: 'DIGEST', subject: '[TEST] A fresh look inside your EmiGuild Vault',
    text: 'Sample email preview. No rewards or tokens have been added to your account.',
    presentation: {
      heading: 'Your next round starts here',
      intro: 'This is a sample of your refreshed game updates. These examples do not reflect your account or grant any rewards.',
      preview: 'Admin preview — sample content, no rewards granted.', buttonLabel: 'OPEN MY VAULT',
      cards: [
        { title: 'Daily Spin · Sample', description: 'Give the wheel a spin and see what lands.' },
        { title: 'Daily Forge · Sample', description: 'Discover an artifact for your collection.' },
        { title: 'Guess 36 · Sample', description: 'Pick your number. See how it plays out.' },
      ], deadlineNotes: ['Sample content only. Live emails show the availability dates for each player.'],
    },
    href: '/vault', sourceRefs: [], validUntil: new Date(now.getTime() + DAY).toISOString(),
  };
}
