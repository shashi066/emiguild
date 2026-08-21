import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { adjustFnbStock, FnbInventoryError, parseFnbStockAdjustment } from '@/lib/fnb-inventory';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const result = await adjustFnbStock(id, session.user.id, parseFnbStockAdjustment(await req.json()));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FnbInventoryError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('F&B stock adjustment failed:', error);
    return NextResponse.json({ error: 'Could not adjust F&B stock.' }, { status: 500 });
  }
}
