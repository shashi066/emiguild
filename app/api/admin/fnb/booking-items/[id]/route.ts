import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { FnbError, removeBookingFnbItem } from '@/lib/fnb';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const item = await removeBookingFnbItem(id, session.user.id);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof FnbError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Removing F&B booking item failed:', error);
    return NextResponse.json({ error: 'Could not remove F&B item.' }, { status: 500 });
  }
}
