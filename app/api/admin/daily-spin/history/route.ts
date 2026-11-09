import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { isValidIstDateKey } from '@/lib/guess-36-clock';
import { requireCurrentUser, RewardError, rewardFailure } from '@/lib/november';
export async function GET(request: Request) {
 const session = await auth();
 if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
 try {
  await requireCurrentUser(session.user.id, prisma, true);
  const date = new URL(request.url).searchParams.get('date');
  if (date && !isValidIstDateKey(date)) throw new RewardError('INVALID_DATE', 'Choose a valid date.');
  const spins = await prisma.userDailySpin.findMany({ where: date ? { spinDate: date } : undefined,
   include: { user: { select: { name: true, email: true } }, lootItem: { select: { name: true, rarity: true, description: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  return lifecycleJson({ spins: spins.map(spin => ({ ...spin, lootItem: spin.rewardSnapshot ? JSON.parse(spin.rewardSnapshot) : spin.lootItem })) });
 } catch (error) { return rewardFailure(error); }
}
