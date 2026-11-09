import { z } from 'zod';
import { auth } from '@/auth';
import { getMineAdmin, MINES_ENABLED_KEY } from '@/lib/guess-36-mines';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requireCurrentUser, requireOrigin, rewardFailure, rewardTransaction } from '@/lib/november';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
 const session = await auth();
 if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
 try { await requireCurrentUser(session.user.id, undefined, true);
  const page = z.coerce.number().int().min(1).max(100000).parse(new URL(request.url).searchParams.get('page') ?? 1);
  return lifecycleJson(await getMineAdmin(page));
 } catch (error) { return rewardFailure(error); }
}
export async function PATCH(request: Request) {
 const session = await auth();
 if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
 try { requireOrigin(request); const input = z.object({ enabled: z.boolean() }).strict().parse(await request.json());
  await rewardTransaction(async tx => { await requireCurrentUser(session.user.id, tx, true);
   await tx.setting.upsert({ where: { key: MINES_ENABLED_KEY }, create: { key: MINES_ENABLED_KEY, value: String(input.enabled), label: 'Guild Expedition enabled' }, update: { value: String(input.enabled) } });
  });
  return lifecycleJson({ enabled: input.enabled });
 } catch (error) { return rewardFailure(error); }
}
