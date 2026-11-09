import { requireCurrentUser, requireOrigin, rewardFailure, RewardError } from '@/lib/november';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import {
  friendlyGuess36Error,
  getGuess36Config,
  updateGuess36Config,
} from '@/lib/guess-36';

const configSchema = z.object({ enabled: z.boolean().optional(), enabledModes: z.unknown().optional(), rewards: z.unknown().optional() })
  .strict().refine((value) => value.enabled !== undefined || value.enabledModes !== undefined || value.rewards !== undefined);

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return forbidden();
  try {
    await requireCurrentUser(session.user.id, undefined, true);
    const config = await getGuess36Config();
    return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return rewardFailure(error); }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return forbidden();
  try {
    await requireCurrentUser(session.user.id, undefined, true);
    requireOrigin(req);
    const parsed = configSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Choose availability, pick types, or configure all three rewards.' }, { status: 400 });
    const config = await updateGuess36Config(parsed.data);
    return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof RewardError) return rewardFailure(error);
    const friendly = friendlyGuess36Error(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
