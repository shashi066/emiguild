import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { adminRentalUpdateSchema, canTransitionPs5Rental, discountedRentalTotal, rentalEndDate } from '@/lib/ps5-rental';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const parsed = adminRentalUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const existing = await prisma.ps5Rental.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  const { expectedUpdatedAt, selectedGames, ...patch } = parsed.data;
  if (existing.updatedAt.toISOString() !== expectedUpdatedAt) return NextResponse.json({ error: 'Rental changed. Refresh and try again.' }, { status: 409 });
  if (patch.status && !canTransitionPs5Rental(existing.status, patch.status)) return NextResponse.json({ error: 'Invalid status transition' }, { status: 409 });
  if (selectedGames) {
    const games = await prisma.game.findMany({ where: { name: { in: selectedGames }, isActive: true }, select: { name: true } });
    const previous: string[] = JSON.parse(existing.selectedGames);
    if (selectedGames.some((name) => !previous.includes(name) && !games.some((game) => game.name === name))) return NextResponse.json({ error: 'One or more games are unavailable.' }, { status: 400 });
  }
  const merged = { ...existing, ...patch };
  if (['CONFIRMED', 'DELIVERED'].includes(merged.status) && !merged.startDate) return NextResponse.json({ error: 'A start date is required.' }, { status: 400 });
  try {
    const rental = await prisma.ps5Rental.update({
      where: { id, updatedAt: new Date(expectedUpdatedAt) },
      data: {
        ...patch,
        ...(selectedGames ? { selectedGames: JSON.stringify(selectedGames) } : {}),
        endDate: merged.startDate ? rentalEndDate(merged.startDate, merged.rentalDays) : null,
        totalPrice: discountedRentalTotal(merged.pricePerDay, merged.controllerPrice, merged.rentalDays, merged.extraControllers, merged.discount),
        ...(['RETURNED', 'CANCELLED'].includes(merged.status) ? { activeUserId: null } : {}),
      },
      include: { user: { select: { email: true } } },
    });
    return NextResponse.json({ rental });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return NextResponse.json({ error: 'Rental changed. Refresh and try again.' }, { status: 409 });
    throw error;
  }
}
