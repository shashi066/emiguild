import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { claimArmorySet, friendlyArmoryError, serializeArmoryActionResult } from '@/lib/armory';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await claimArmorySet(session.user.id);
    return NextResponse.json(serializeArmoryActionResult(result));
  } catch (error) {
    const friendly = friendlyArmoryError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
