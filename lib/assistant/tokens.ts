import crypto from 'node:crypto';
import type { BookingDraft, SignedAssistantAction } from '@/types/assistant';

type UnsignedAssistantAction =
  | { action: 'BOOKING'; userId: string; draft: BookingDraft; quoteHash: string }
  | { action: 'CANCELLATION'; userId: string; bookingId: string }
  | { action: 'DAILY_SPIN'; userId: string; spinDate: string };

function secret() {
  const value = process.env.ASSISTANT_ACTION_SECRET;
  if (!value) throw new Error('ASSISTANT_ACTION_SECRET is not configured.');
  return value;
}

function sign(encodedPayload: string) {
  return crypto.createHmac('sha256', secret()).update(encodedPayload).digest('base64url');
}

export function createActionToken(
  action: UnsignedAssistantAction,
  ttlSeconds = 300,
) {
  const payload = {
    ...action,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    jti: crypto.randomUUID(),
  } as SignedAssistantAction;
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifyActionToken(token: string): SignedAssistantAction {
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra) throw new Error('Invalid confirmation token.');
  const expected = sign(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new Error('Invalid confirmation token.');
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedAssistantAction;
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('This confirmation has expired. Please prepare it again.');
  }
  return payload;
}

export function quoteFingerprint(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('base64url');
}
