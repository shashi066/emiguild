import { auth } from '@/auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { configureHappyPool } from '@/lib/happy-tickets';
import { changeGuildReset } from '@/lib/guild-resets';
import { happyConfigSchema, readHappyConfig } from '@/lib/happy-ticket-rules';
import { audit, getFeatureFlags, NOVEMBER_FLAGS, requestIdSchema, requireCurrentUser, requireOrigin, rewardFailure, rewardTransaction } from '@/lib/november';
import { lifecycleJson } from '@/lib/lifecycle/http';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
  try {
    await requireCurrentUser(session.user.id, prisma, true);
    const cursor = new URL(request.url).searchParams.get('cursor');
    const now = new Date();
    const [pool, tickets, resets, history, stations, issued, redeemed, expired, flags] = await Promise.all([
      prisma.happyPool.findUnique({ where: { id: 'main' } }),
      prisma.happyTicket.findMany({ take: 50, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: [{ claimedAt: 'desc' }, { id: 'desc' }], include: { user: { select: { id: true, name: true, email: true } }, redemptions: true } }),
      prisma.guildReset.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.rewardAudit.findMany({ where: { action: { in: ['POOL_FORCE', 'POOL_ACTIVATE'] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, select: { id: true, action: true, createdAt: true, before: true, after: true } }),
      prisma.station.findMany({ where: { hasControllers: true, isActive: true }, select: { id: true, name: true } }),
      prisma.happyTicket.count(), prisma.happyTicket.count({ where: { status: 'REDEEMED' } }),
      prisma.happyTicket.count({ where: { OR: [{ status: 'EXPIRED' }, { status: 'CLAIMED', expiresAt: { lte: now } }] } }),
      getFeatureFlags(),
    ]);
    const events = history.map(row => ({ id: row.id, kind: row.action.replace('POOL_', ''), createdAt: row.createdAt, before: JSON.parse(row.before ?? '{}').available, after: JSON.parse(row.after).available }));
    return lifecycleJson({ pool: { ...(pool ?? { id: 'main', available: 5, version: 0 }), config: readHappyConfig(pool?.config ?? '{}') }, tickets, nextCursor: tickets.length === 50 ? tickets.at(-1)?.id : null, resets: resets.map(r => ({ ...r, status: r.status === 'PENDING' && r.expiresAt && r.expiresAt <= now ? 'EXPIRED' : r.status })), events, stations, counts: { issued, redeemed, expired }, flags });
  } catch (error) { return rewardFailure(error); }
}
const resetSchema = z.object({ requestId: requestIdSchema, action: z.enum(['FORCE', 'BANK', 'ACTIVATE', 'CANCEL']), reason: z.string().trim().min(1).max(500), resetId: z.string().optional(), version: z.number().int().min(0).optional() }).strict();
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
