import { Prisma } from '@prisma/client';
import { adminRentalCreateSchema, discountedRentalTotal, rentalEndDate, parsePs5RentalPrice } from '@/lib/ps5-rental';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// GET — all rentals (admin only)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const page = Math.max(1, Math.min(100000, Number(searchParams.get('page')) || 1));
  if (!Number.isInteger(page)) return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
  const pageSize = 25;

  const rentals = await prisma.ps5Rental.findMany({
    where: status && status !== 'ALL' ? { status } : undefined,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
    include: {
      user: { select: { email: true } },
    },
  });

  const settings = await prisma.setting.findMany({ where: { key: { in: ['ps5_rental_price_per_day', 'ps5_rental_extra_controller'] } } });
  const prices = Object.fromEntries(settings.map((item) => [item.key, item.value]));
  return NextResponse.json({ defaults: { pricePerDay: parsePs5RentalPrice(prices.ps5_rental_price_per_day, 1200), controllerPrice: parsePs5RentalPrice(prices.ps5_rental_extra_controller, 500) }, rentals: rentals.slice(0, pageSize), page, hasMore: rentals.length > pageSize });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = adminRentalCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { selectedGames, ...data } = parsed.data;
  if (data.userId && !await prisma.user.findUnique({ where: { id: data.userId }, select: { id: true } })) return NextResponse.json({ error: 'Customer not found' }, { status: 400 });
  const games = await prisma.game.findMany({ where: { name: { in: selectedGames }, isActive: true }, select: { name: true } });
  if (selectedGames.some((name) => !games.some((game) => game.name === name))) return NextResponse.json({ error: 'One or more games are unavailable.' }, { status: 400 });
  try {
    const rental = await prisma.ps5Rental.create({ data: {
      ...data, source: 'WALK_IN', status: 'CONFIRMED', activeUserId: data.userId,
      selectedGames: JSON.stringify(selectedGames), endDate: rentalEndDate(data.startDate, data.rentalDays),
      totalPrice: discountedRentalTotal(data.pricePerDay, data.controllerPrice, data.rentalDays, data.extraControllers, data.discount),
    }, include: { user: { select: { email: true } } } });
    return NextResponse.json({ rental }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: 'This customer already has an active rental.' }, { status: 409 });
    throw error;
  }
}
