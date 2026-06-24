import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// PATCH /api/admin/daily-spin/items/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { name, description, iconUrl, weight, enabled, rarity } = body;

    const item = await prisma.lootItem.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(iconUrl !== undefined && { iconUrl }),
        ...(weight !== undefined && { weight: Number(weight) }),
        ...(enabled !== undefined && { enabled }),
        ...(rarity !== undefined && { rarity }),
      },
    });

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Error updating loot item:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

// DELETE /api/admin/daily-spin/items/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    // Note: If an item is deleted, relations in UserDailySpin will be set to NULL due to onDelete: SetNull
    await prisma.lootItem.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting loot item:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
