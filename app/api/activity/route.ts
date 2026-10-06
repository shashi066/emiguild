import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ACTIVITY_THROTTLE_MS } from '@/lib/lifecycle/rules';
import { isSameOrigin, lifecycleJson } from '@/lib/lifecycle/http';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Unauthorized' }, 401);
  if (!isSameOrigin(request)) return lifecycleJson({ error: 'Forbidden' }, 403);
  try {
    const now = new Date();
    await prisma.user.updateMany({
      where: { id: session.user.id, OR: [{ lastWebsiteVisitAt: null }, { lastWebsiteVisitAt: { lte: new Date(now.getTime() - ACTIVITY_THROTTLE_MS) } }] },
      data: { lastWebsiteVisitAt: now },
    });
    return lifecycleJson({ ok: true });
  } catch (error) {
    console.error('Activity update failed', error);
    return lifecycleJson({ error: 'Activity could not be recorded.' }, 500);
  }
}
