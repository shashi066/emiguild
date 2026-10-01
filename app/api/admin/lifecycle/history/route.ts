import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { lifecycleJson } from '@/lib/lifecycle/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if ((await auth())?.user?.role !== 'ADMIN') return lifecycleJson({ error: 'Forbidden' }, 403);
  const params = new URL(request.url).searchParams;
  const cursor = params.get('cursor');
  const userId = params.get('userId');
  const rows = await prisma.lifecycleEmailDelivery.findMany({ where: userId ? { userId } : {}, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 26,
    select: { id: true, campaign: true, recipient: true, status: true, createdAt: true, dispatchedAt: true, finishedAt: true, errorCode: true, user: { select: { id: true, name: true } } } });
  return lifecycleJson({ deliveries: rows.slice(0, 25), nextCursor: rows.length > 25 ? rows[24].id : null });
}
