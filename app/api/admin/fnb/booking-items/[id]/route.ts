import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { FnbInventoryError, parseVoidBookingFnbItem, voidBookingFnbItem } from '@/lib/fnb-inventory';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const { reason } = parseVoidBookingFnbItem(await req.json());
    const item = await voidBookingFnbItem(id, session.user.id, reason);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof FnbInventoryError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Voiding F&B booking item failed:', error);
    return NextResponse.json({ error: 'Could not void F&B item.' }, { status: 500 });
  }
}
