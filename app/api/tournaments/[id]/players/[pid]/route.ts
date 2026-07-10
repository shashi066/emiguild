import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { pid } = await params;
  const { name, seed } = await req.json();

  const player = await prisma.tournamentPlayer.update({
    where: { id: pid },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(seed !== undefined && { seed }),
    },
  });

  return NextResponse.json({ player });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { pid } = await params;
  await prisma.tournamentPlayer.delete({ where: { id: pid } });
  return NextResponse.json({ ok: true });
}
