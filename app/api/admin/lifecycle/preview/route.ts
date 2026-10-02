import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { caseInsensitiveContains } from '@/lib/prisma-search';
import { loadEmailEvaluation } from '@/lib/lifecycle/evaluation';
import { lifecycleJson } from '@/lib/lifecycle/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if ((await auth())?.user?.role !== 'ADMIN') return lifecycleJson({ error: 'Forbidden' }, 403);
  try {
    const params = new URL(request.url).searchParams;
    const userId = params.get('userId');
    if (!userId) {
      const query = (params.get('q') ?? '').trim().slice(0, 80);
      const users = query.length < 2 ? [] : await prisma.user.findMany({ where: { role: 'USER', OR: [{ name: caseInsensitiveContains(query) }, { email: caseInsensitiveContains(query) }] }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 20 });
      return lifecycleJson({ users });
    }
    const evaluation = await loadEmailEvaluation(userId);
    if (!evaluation || evaluation.user.role !== 'USER') return lifecycleJson({ error: 'Player not found' }, 404);
    return lifecycleJson({ ...evaluation.preview, player: { id: evaluation.user.id, name: evaluation.user.name }, settings: evaluation.input.settings });
  } catch { return lifecycleJson({ error: 'Preview could not be loaded. Please try again.' }, 500); }
}
