import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getArmoryConsumedSets, lookupArmoryTicket } from '@/lib/armory';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const date = params.get('date') ?? '';
  const code = params.get('code') ?? '';

  if (date.trim()) {
    const tickets = await getArmoryConsumedSets(date);
    return NextResponse.json({ tickets }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (!code.trim()) {
    return NextResponse.json({ ticket: null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const ticket = await lookupArmoryTicket(code);
  return NextResponse.json({ ticket }, { headers: { 'Cache-Control': 'no-store' } });
}
