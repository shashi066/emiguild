import { prisma } from '@/lib/prisma';
import { UnsubscribeIdentity } from './email';
export async function unsubscribeEmail(identity: UnsubscribeIdentity, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: identity.userId }, select: { email: true } });
  if (!user || user.email !== identity.email) return false;
  await prisma.lifecycleEmailState.upsert({ where: { userId: identity.userId }, create: { userId: identity.userId, unsubscribedAt: now }, update: { unsubscribedAt: now } });
  return true;
}
