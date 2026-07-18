import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { friendlyArmoryError, redeemArmoryTicket } from '@/lib/armory';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const ticket = await redeemArmoryTicket(id);
    return NextResponse.json({ ticket });
  } catch (error) {
    const friendly = friendlyArmoryError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
