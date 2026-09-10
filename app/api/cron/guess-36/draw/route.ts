import { NextRequest, NextResponse } from 'next/server';
import { drawGuess36Round } from '@/lib/guess-36';
import { getPreviousIstDateKey } from '@/lib/guess-36-clock';

export const dynamic = 'force-dynamic';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(_req: NextRequest) {
  try {
    const now = new Date();
    const result = await drawGuess36Round(getPreviousIstDateKey(now), now);
    return NextResponse.json({ success: true, result }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Guess 36 cron draw failed:', error);
    return NextResponse.json({ error: 'Guess 36 draw failed.' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
