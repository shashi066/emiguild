import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// PUT — cancel own rental (user only, must be PENDING)
export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const rental = await prisma.ps5Rental.findUnique({ where: { id } });
  if (!rental) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }

  if (rental.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (rental.status !== 'PENDING') {
    return NextResponse.json(
      { error: 'Only pending rentals can be cancelled.' },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.ps5Rental.update({
      where: { id, userId: session.user.id, status: 'PENDING' },
      data: { status: 'CANCELLED', activeUserId: null },
    });

    return NextResponse.json({ rental: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return NextResponse.json({ error: 'Rental changed. Refresh and try again.' }, { status: 409 });
    throw error;
  }
}
