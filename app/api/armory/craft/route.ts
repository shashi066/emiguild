import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { craftArmoryArtifact, friendlyArmoryError } from '@/lib/armory';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const result = await craftArmoryArtifact(session.user.id, String(body.artifactId || ''));
    return NextResponse.json(result);
  } catch (error) {
    const friendly = friendlyArmoryError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
