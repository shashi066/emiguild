import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { forgeArtifact, friendlyArmoryError } from '@/lib/armory';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await forgeArtifact(session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    const friendly = friendlyArmoryError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
