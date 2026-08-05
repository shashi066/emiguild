import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAdminAnalytics } from '@/lib/analytics/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const analytics = await getAdminAnalytics();
    return NextResponse.json(analytics, {
      headers: NO_STORE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to load analytics.' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
