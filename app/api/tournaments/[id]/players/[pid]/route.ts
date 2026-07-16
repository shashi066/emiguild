import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { encryptPhone } from '@/lib/crypto';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { pid } = await params;
  const { name, phone, seed } = await req.json();

  const player = await prisma.tournamentPlayer.update({
    where: { id: pid },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(seed !== undefined && { seed }),
    },
  });

  return NextResponse.json({ player: { ...player, phone: encryptPhone(player.phone) } });
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
