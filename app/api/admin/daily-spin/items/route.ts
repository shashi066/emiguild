import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { encryptNumber } from '@/lib/crypto';

// GET /api/admin/daily-spin/items
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const items = await prisma.lootItem.findMany({
      orderBy: { weight: 'desc' },
    });
    const encryptedItems = items.map(item => ({ ...item, weight: encryptNumber(item.weight) }));
    return NextResponse.json({ items: encryptedItems });
  } catch (error) {
    console.error('Error fetching loot items:', error);
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}

// POST /api/admin/daily-spin/items
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, description, iconUrl, weight, enabled, rarity } = body;

    if (!name || weight === undefined) {
      return NextResponse.json({ error: 'Name and weight are required' }, { status: 400 });
    }

    const item = await prisma.lootItem.create({
      data: {
        name,
        description: description || null,
        iconUrl: iconUrl || null,
        weight: Number(weight),
        enabled: enabled ?? true,
        rarity: rarity || 'COMMON',
      },
    });

    return NextResponse.json({ item: { ...item, weight: encryptNumber(item.weight) } }, { status: 201 });
  } catch (error) {
    console.error('Error creating loot item:', error);
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  }
}
