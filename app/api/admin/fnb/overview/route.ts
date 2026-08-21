import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getFnbInventoryOverview } from '@/lib/fnb-inventory';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  return NextResponse.json(await getFnbInventoryOverview(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
