import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { searchTowerUsers } from '@/lib/tower';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const users = await searchTowerUsers(req.nextUrl.searchParams.get('q') ?? '');
  return NextResponse.json({ users }, { headers: { 'Cache-Control': 'no-store' } });
}
