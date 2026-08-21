import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { FnbInventoryError, getFnbRevenueReport } from '@/lib/fnb-inventory';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (!from || !to) {
      return NextResponse.json({ error: 'Both from and to dates are required.' }, { status: 400 });
    }
    return NextResponse.json(await getFnbRevenueReport(from, to), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof FnbInventoryError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('F&B revenue report failed:', error);
    return NextResponse.json({ error: 'Could not load F&B revenue.' }, { status: 500 });
  }
}
