import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getMessagingSettings } from '@/lib/lifecycle/settings';
import { isSameOrigin, lifecycleJson } from '@/lib/lifecycle/http';
export const dynamic = 'force-dynamic';
const schema = z.object({ comebackEmail: z.boolean(), emailDigest: z.boolean() }).strict();
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return lifecycleJson({ error: 'Forbidden' }, 403);
  try { return lifecycleJson(await getMessagingSettings()); }
  catch { return lifecycleJson({ error: 'Messaging settings could not be loaded.' }, 500); }
}
export async function PUT(request: Request) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN' || !isSameOrigin(request)) return lifecycleJson({ error: 'Forbidden' }, 403);
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return lifecycleJson({ error: 'Choose valid email campaign settings.' }, 400);
  try {
    const rows = [
      { key: 'lifecycle_comeback_email', value: String(input.data.comebackEmail), label: 'Three-day comeback email' },
      { key: 'lifecycle_email_digest', value: String(input.data.emailDigest), label: 'Global weekly account digest' },
    ];
    await prisma.$transaction(rows.map((row) => prisma.setting.upsert({ where: { key: row.key }, create: row, update: { value: row.value } })));
    return lifecycleJson(input.data);
  } catch { return lifecycleJson({ error: 'Messaging settings could not be saved.' }, 500); }
}
