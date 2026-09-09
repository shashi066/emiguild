import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  friendlyWatchPartyError,
  getF12026ImportCatalog,
  importF12026WatchParties,
} from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  return session?.user?.id && session.user.role === 'ADMIN' ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(getF12026ImportCatalog(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const result = await importF12026WatchParties(session.user.id, await req.json());
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyWatchPartyError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}
