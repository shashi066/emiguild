import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  friendlyWatchPartyError,
  getAdminWatchPartyFanPickAudit,
} from '@/lib/watch-party';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const result = await getAdminWatchPartyFanPickAudit(id, {
      query: req.nextUrl.searchParams.get('q'),
      status: req.nextUrl.searchParams.get('status'),
      skip: req.nextUrl.searchParams.get('skip'),
      take: req.nextUrl.searchParams.get('take'),
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyWatchPartyError(error);
    return NextResponse.json(
      { error: friendly.error, code: friendly.code },
      { status: friendly.status },
    );
  }
}
