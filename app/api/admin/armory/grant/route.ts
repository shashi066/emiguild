import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  grantAdminArmoryArtifact,
  parseAdminArtifactGrantRequest,
} from '@/lib/armory';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const input = parseAdminArtifactGrantRequest(await req.json());
    const grant = await grantAdminArmoryArtifact(input.userId, input.setId);
    return NextResponse.json(
      { success: true, grant },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: any) {
    const code = error instanceof SyntaxError ? 'INVALID_GRANT_REQUEST' : error?.message;
    if (code === 'INVALID_GRANT_REQUEST') {
      return NextResponse.json({ error: 'A valid user and artifact rarity are required.' }, { status: 400 });
    }
    if (code === 'USER_NOT_FOUND') {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    if (code === 'SET_NOT_AVAILABLE') {
      return NextResponse.json({ error: 'This artifact rarity is not available.' }, { status: 409 });
    }
    if (code === 'INCOMPLETE_SET') {
      return NextResponse.json(
        { error: 'All four artifacts must be active before this rarity can be granted.' },
        { status: 409 },
      );
    }

    console.error('Admin artifact grant failed:', error);
    return NextResponse.json({ error: 'Failed to grant artifact.' }, { status: 500 });
  }
}
