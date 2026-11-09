import { auth } from '@/auth';
import { encryptNumber } from '@/lib/crypto';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requireOrigin, rewardFailure } from '@/lib/november';
import { mutateSpinItem } from '@/lib/spin-selection';
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Context) {
 const session = await auth();
 if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
 try { requireOrigin(request); const item = await mutateSpinItem(session.user.id, (await params).id, await request.json()); return lifecycleJson({ item: { ...item, weight: encryptNumber(item.weight) } }); }
 catch (error) { return rewardFailure(error); }
}
export async function DELETE(request: Request, { params }: Context) {
 const session = await auth();
 if (!session?.user?.id) return lifecycleJson({ error: 'Forbidden' }, 403);
 try { requireOrigin(request); await mutateSpinItem(session.user.id, (await params).id, null, true); return lifecycleJson({ success: true }); }
 catch (error) { return rewardFailure(error); }
}
