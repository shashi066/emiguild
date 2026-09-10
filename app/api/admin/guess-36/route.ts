import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyGuess36Error, getGuess36AdminData } from '@/lib/guess-36';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const params = req.nextUrl.searchParams;
  try {
    const data = await getGuess36AdminData({
      roundDate: params.get('roundDate') || undefined,
      view: params.get('view') || undefined,
      cursor: params.get('cursor') || undefined,
      take: Number(params.get('take') || 25),
    });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyGuess36Error(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
