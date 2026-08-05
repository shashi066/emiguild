import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { processHomepageAnalyticsRequest } from '@/lib/analytics/interaction';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const accepted = await processHomepageAnalyticsRequest(request, async () => {
      const session = await auth();
      return session?.user?.id;
    });
    if (!accepted) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
