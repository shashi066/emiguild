import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTowerAdminHistory } from '@/lib/tower';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const params = req.nextUrl.searchParams;
  const result = await getTowerAdminHistory({
    cursor: params.get('cursor') || undefined,
    take: Number(params.get('take') || 25),
    status: params.get('status') || undefined,
    query: params.get('q') || undefined,
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
