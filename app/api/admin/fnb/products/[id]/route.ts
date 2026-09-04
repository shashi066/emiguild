import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { FnbError, parseFnbProductUpdate, updateFnbProduct } from '@/lib/fnb';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const product = await updateFnbProduct(id, parseFnbProductUpdate(await req.json()));
    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof FnbError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('F&B item update failed:', error);
    return NextResponse.json({ error: 'Could not update F&B item.' }, { status: 500 });
  }
}
