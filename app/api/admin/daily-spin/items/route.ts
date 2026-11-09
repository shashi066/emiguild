import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { encryptNumber } from '@/lib/crypto';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requireCurrentUser, requireOrigin, rewardFailure } from '@/lib/november';
import { mutateSpinItem } from '@/lib/spin-selection';
export async function GET() {
 const session = await auth();
 if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
 try {
  await requireCurrentUser(session.user.id, prisma, true);
  const items = await prisma.lootItem.findMany({ orderBy: { weight: 'desc' } });
  return lifecycleJson({ items: items.map(item => ({ ...item, weight: encryptNumber(item.weight) })) });
 } catch (error) { return rewardFailure(error); }
}
export async function POST(request: Request) {
 const session = await auth();
 if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
 try { requireOrigin(request); const item = await mutateSpinItem(session.user.id, null, await request.json()); return lifecycleJson({ item: { ...item, weight: encryptNumber(item.weight) } }, 201); }
 catch (error) { return rewardFailure(error); }
}
