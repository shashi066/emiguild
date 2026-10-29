import { encryptPhone } from '@/lib/crypto';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requestIdSchema, requireCurrentUser, rewardFailure } from '@/lib/november';
export async function GET(_: Request, { params }: { params: Promise<{ operation: string; requestId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Unauthorized' }, 401);
  try {
    const { operation, requestId } = await params;
    if (!['HAPPY_CLAIM', 'HAPPY_RESET', 'HAPPY_BOOKING', 'GUILD_RESET', 'ADMIN_BOOKING_EDIT'].includes(operation)) return lifecycleJson({ error: 'Not found' }, 404);
    if (['GUILD_RESET', 'ADMIN_BOOKING_EDIT'].includes(operation)) await requireCurrentUser(session.user.id, prisma, true);
    if (operation === 'HAPPY_RESET') await requireCurrentUser(session.user.id, prisma);
    requestIdSchema.parse(requestId);
    const row = await prisma.rewardReceipt.findUnique({ where: { actorId_operation_requestId: { actorId: session.user.id, operation, requestId } } });
    if (!row) return lifecycleJson({ error: 'No committed result yet.' }, 404);
    const result = JSON.parse(row.response);
    if (operation === 'ADMIN_BOOKING_EDIT' && result.booking) result.booking.customerPhone = encryptPhone(result.booking.customerPhone);
    return lifecycleJson(result);
  } catch (error) { return rewardFailure(error); }
}
