import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyGuess36Error, redeemGuess36Ticket } from '@/lib/guess-36';

export async function POST(_: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const { ticketId } = await params;
    const ticket = await redeemGuess36Ticket(ticketId);
    return NextResponse.json({ ticket }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const friendly = friendlyGuess36Error(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
