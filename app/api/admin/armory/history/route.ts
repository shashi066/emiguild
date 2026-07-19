import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getArmoryConsumedSets,
  getArmoryDailyDrops,
  getArmoryUserInventory,
  searchArmoryInventoryUsers,
} from '@/lib/armory';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const date = params.get('date')?.trim() || '';
  const type = params.get('type') || 'drops';

  try {
    if (type === 'users') {
      const users = await searchArmoryInventoryUsers(params.get('search') || '');
      return NextResponse.json({ users }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (type === 'inventory') {
      const userId = params.get('userId')?.trim() || '';
      if (!userId) return NextResponse.json({ error: 'User is required.' }, { status: 400 });
      const inventory = await getArmoryUserInventory(userId);
      if (!inventory) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      return NextResponse.json({ inventory }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'A valid history date is required.' }, { status: 400 });
    }

    const rows = type === 'sets'
      ? await getArmoryConsumedSets(date)
      : await getArmoryDailyDrops(date);
    return NextResponse.json({ type, rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Artifacts history load failed:', error);
    return NextResponse.json({ error: 'Failed to load Artifacts history.' }, { status: 500 });
  }
}
