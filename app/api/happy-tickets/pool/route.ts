import { prisma } from '@/lib/prisma';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { rewardFailure } from '@/lib/november';
export async function GET() {
  try {
    const pool = await prisma.happyPool.findUnique({ where: { id: 'main' }, select: { available: true } });
    return lifecycleJson({ available: pool?.available ?? 5, capacity: 5 });
  } catch (error) { return rewardFailure(error); }
}
