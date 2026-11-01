import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requireCurrentUser, rewardFailure } from '@/lib/november';
import { readHappyConfig } from '@/lib/happy-ticket-rules';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
  try {
    await requireCurrentUser(session.user.id, prisma, true);
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return lifecycleJson({ error: 'Select a linked customer.' }, 400);
    const tickets = await prisma.happyTicket.findMany({
      where: { userId, status: 'CLAIMED', expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'asc' },
      select: { id: true, expiresAt: true, rulesSnapshot: true },
    });
    return lifecycleJson({ tickets: tickets.map(({ rulesSnapshot, ...ticket }) => ({ ...ticket, rules: readHappyConfig(rulesSnapshot) })) });
  } catch (error) { return rewardFailure(error); }
}
