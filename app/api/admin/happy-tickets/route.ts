import { auth } from '@/auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { configureHappyPool } from '@/lib/happy-tickets';
import { changeGuildReset } from '@/lib/guild-resets';
import { happyConfigSchema } from '@/lib/happy-ticket-rules';
import { audit, NOVEMBER_FLAGS, requestIdSchema, requireCurrentUser, requireOrigin, rewardFailure, rewardTransaction } from '@/lib/november';
import { getAdminHappyTicketsReport } from '@/lib/admin-happy-tickets';
import { lifecycleJson } from '@/lib/lifecycle/http';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
  try {
    await requireCurrentUser(session.user.id, prisma, true);
    return lifecycleJson(await getAdminHappyTicketsReport(session.user.id, new URL(request.url).searchParams));
  } catch (error) { return rewardFailure(error); }
}
const resetSchema = z.object({ requestId: requestIdSchema, action: z.enum(['FORCE', 'BANK', 'CANCEL']), reason: z.string().trim().min(1).max(500), grantId: z.string().min(1).optional(), expectedAccounts: z.number().int().min(1).optional() }).strict().refine(v => v.action === 'CANCEL' ? !!v.grantId : v.expectedAccounts !== undefined, 'Confirm the affected account count or choose a grant.');
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
  try {
    requireOrigin(request); await requireCurrentUser(session.user.id, prisma, true);
    const { kind, input } = z.object({ kind: z.enum(['CONFIG', 'RESET', 'FLAG']), input: z.unknown() }).strict().parse(await request.json());
    let result;
    if (kind === 'CONFIG') {
      const value = z.object({ config: happyConfigSchema, version: z.number().int().min(0) }).strict().parse(input);
      result = await configureHappyPool(session.user.id, value.config, value.version);
    } else if (kind === 'RESET') result = await changeGuildReset(session.user.id, resetSchema.parse(input));
    else {
      const value = z.object({ key: z.enum(NOVEMBER_FLAGS), enabled: z.boolean() }).strict().parse(input);
      result = await rewardTransaction(async tx => {
        await requireCurrentUser(session.user.id, tx, true);
        const old = await tx.setting.findUnique({ where: { key: value.key } });
        const saved = await tx.setting.upsert({ where: { key: value.key }, create: { key: value.key, value: String(value.enabled) }, update: { value: String(value.enabled) } });
        await audit(tx, session.user.id, 'FEATURE_SWITCH', value.key, old?.value, saved.value);
        return saved;
      });
    }
    return lifecycleJson({ success: true, result });
  } catch (error) { return rewardFailure(error); }
}
