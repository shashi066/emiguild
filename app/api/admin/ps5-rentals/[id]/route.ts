import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { z } from 'zod';
import { canTransitionPs5Rental } from '@/lib/ps5-rental';

const updateSchema = z.object({
  status: z.enum(['CONFIRMED', 'DELIVERED', 'RETURNED', 'CANCELLED']).optional(),
  adminComment: z.string().max(500).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).refine((data) => data.status !== undefined || data.adminComment !== undefined || data.startDate !== undefined || data.endDate !== undefined, 'No changes supplied');

// PUT — update rental status (admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const body = await req.json();
  const result = updateSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid data', issues: result.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.ps5Rental.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }

  const { status, adminComment, startDate, endDate } = result.data;
  if (status && !canTransitionPs5Rental(existing.status, status)) {
    return NextResponse.json({ error: `Cannot change rental from ${existing.status} to ${status}.`, code: 'INVALID_STATUS_TRANSITION' }, { status: 409 });
  }

  const rental = await prisma.ps5Rental.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(status === 'RETURNED' || status === 'CANCELLED' ? { activeUserId: null } : {}),
      ...(adminComment !== undefined ? { adminComment } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    },
    include: {
      user: { select: { name: true, email: true, phone: true } },
    },
  });

  return NextResponse.json({ rental });
}
