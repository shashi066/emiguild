import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  addBookingFnbItem,
  FnbInventoryError,
  getFnbBookingItems,
  parseBookingFnbItem,
} from '@/lib/fnb-inventory';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  const { id } = await params;
  const items = await getFnbBookingItems(id);
  return NextResponse.json({
    items,
    activeSubtotal: items
      .filter((item) => item.status === 'ACTIVE')
      .reduce((total, item) => total + item.subtotal, 0),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const item = await addBookingFnbItem(id, session.user.id, parseBookingFnbItem(await req.json()));
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof FnbInventoryError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Adding F&B item to booking failed:', error);
    return NextResponse.json({ error: 'Could not add F&B item to booking.' }, { status: 500 });
  }
}
