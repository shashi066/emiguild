import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAdminRevenue } from '@/lib/admin-revenue';
import { rentalDateSchema } from '@/lib/ps5-rental';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  if (!rentalDateSchema.safeParse(from).success || !rentalDateSchema.safeParse(to).success) {
    return NextResponse.json({ error: 'Valid from and to dates are required.' }, { status: 400 });
  }

  if (from > to) {
    return NextResponse.json({ error: 'Start date must be before end date.' }, { status: 400 });
  }

  const revenue = await getAdminRevenue({ from, to });

  return NextResponse.json({
    from,
    to,
    ...revenue,
  });
}
