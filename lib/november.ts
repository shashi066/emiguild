import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';
import { armoryTransaction } from './armory-transaction';
import { isSameOrigin, lifecycleJson } from './lifecycle/http';

export const rewardTransaction = armoryTransaction;
export type RewardTx = Prisma.TransactionClient;
export const requestIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/);
export const NOVEMBER_FLAGS = ['legendary_pity_30_enabled', 'tower_loss_rewards_enabled', 'happy_tickets_enabled', 'guild_resets_enabled'] as const;
export type NovemberFlag = typeof NOVEMBER_FLAGS[number];

export class RewardError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export async function featureEnabled(key: NovemberFlag, db: RewardTx | typeof prisma = prisma) {
  return (await db.setting.findUnique({ where: { key } }))?.value !== 'false';
}
export async function getFeatureFlags(keys: readonly NovemberFlag[] = NOVEMBER_FLAGS, db: RewardTx | typeof prisma = prisma) {
  const rows = await db.setting.findMany({ where: { key: { in: [...keys] } }, select: { key: true, value: true } });
  const values = new Map(rows.map(row => [row.key, row.value]));
  return Object.fromEntries(keys.map(key => [key, values.get(key) !== 'false'])) as Record<NovemberFlag, boolean>;
}
export function fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export async function receipt<T>(tx: RewardTx, actorId: string, operation: string, requestId: string, input: unknown): Promise<T | null> {
  requestIdSchema.parse(requestId);
  const row = await tx.rewardReceipt.findUnique({ where: { actorId_operation_requestId: { actorId, operation, requestId } } });
  if (!row) return null;
  if (row.fingerprint !== fingerprint(input)) throw new RewardError('REQUEST_CONFLICT', 'This request ID belongs to a different action.', 409);
  return JSON.parse(row.response) as T;
}
export async function saveReceipt(tx: RewardTx, actorId: string, operation: string, requestId: string, input: unknown, result: unknown) {
  await tx.rewardReceipt.create({ data: { actorId, operation, requestId, fingerprint: fingerprint(input), response: JSON.stringify(result) } });
}
export async function requireCurrentUser(userId: string, db: RewardTx | typeof prisma = prisma, admin = false) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user || (admin && user.role !== 'ADMIN')) throw new RewardError('FORBIDDEN', 'Forbidden', 403);
  return user;
}
export function requireOrigin(request: Request) {
  if (!isSameOrigin(request)) throw new RewardError('INVALID_ORIGIN', 'Invalid request origin.', 403);
}
export function rewardFailure(error: unknown) {
  if (error instanceof RewardError) return lifecycleJson({ error: error.message, code: error.code }, error.status);
  if (error instanceof z.ZodError) return lifecycleJson({ error: 'Invalid input.', issues: error.issues }, 400);
  if (error instanceof SyntaxError) return lifecycleJson({ error: 'Invalid JSON.' }, 400);
  console.error('november_operation_failed', { code: (error as { code?: string })?.code ?? 'UNKNOWN' });
  return lifecycleJson({ error: 'Could not confirm this action. Check its result before retrying.', code: 'UNCONFIRMED' }, 503);
}
export async function audit(tx: RewardTx, actorId: string, action: string, referenceId: string, before: unknown, after: unknown, options: { resetId?: string; createdAt?: Date } = {}) {
  await tx.rewardAudit.create({ data: { actorId, action, referenceId, before: before == null ? null : JSON.stringify(before), after: JSON.stringify(after), ...options } });
}
