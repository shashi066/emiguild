import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  createFnbProduct,
  FnbInventoryError,
  getFnbProducts,
  parseFnbProductInput,
} from '@/lib/fnb-inventory';

function forbidden() {
  return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') return forbidden();
  const includeInactive = new URL(req.url).searchParams.get('includeInactive') === 'true';
  return NextResponse.json({ products: await getFnbProducts(includeInactive) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') return forbidden();
  try {
    const product = await createFnbProduct(session.user.id, parseFnbProductInput(await req.json()));
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof FnbInventoryError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('F&B product creation failed:', error);
    return NextResponse.json({ error: 'Could not create F&B product.' }, { status: 500 });
  }
}
