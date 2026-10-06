import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { Prisma } from '@prisma/client';
import {
  calculatePs5RentalTotal,
  createPs5RentalSchema,
  parsePs5RentalPrice,
  resolvePs5RentalAvailability,
} from '@/lib/ps5-rental';

// POST — create a new rental order
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const result = createPs5RentalSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid data', issues: result.error.issues },
      { status: 400 },
    );
  }

  // Check if rental is enabled
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['ps5_rental_status', 'ps5_rental_enabled', 'ps5_rental_price_per_day', 'ps5_rental_extra_controller'] } },
  });
  const settingsMap = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
  if (resolvePs5RentalAvailability(settingsMap) !== 'AVAILABLE') {
    return NextResponse.json(
      { error: 'PS5 rental service is not accepting orders right now.', code: 'RENTAL_UNAVAILABLE' },
      { status: 409 },
    );
  }

  const pricePerDay = parsePs5RentalPrice(settingsMap.ps5_rental_price_per_day, 1200);
  const controllerPricePerDay = parsePs5RentalPrice(settingsMap.ps5_rental_extra_controller, 500);

  const { rentalDays, extraControllers, selectedGameIds, customerName, customerPhone, deliveryAddress, deliveryCity, deliveryPincode, deliveryNotes } = result.data;
  const games = await prisma.game.findMany({
    where: { id: { in: selectedGameIds }, isActive: true },
    select: { id: true, name: true },
  });
  if (games.length !== selectedGameIds.length) {
    return NextResponse.json({ error: 'One or more selected games are unavailable.', code: 'INVALID_GAMES' }, { status: 400 });
  }
  const namesById = new Map(games.map((game) => [game.id, game.name]));
  const selectedGames = selectedGameIds.map((id) => namesById.get(id)!);

  const totalPrice = calculatePs5RentalTotal(pricePerDay, controllerPricePerDay, rentalDays, extraControllers);

  try {
    const rental = await prisma.ps5Rental.create({ data: {
      userId: session.user.id,
      activeUserId: session.user.id,
      rentalDays,
      extraControllers,
      pricePerDay,
      controllerPrice: controllerPricePerDay,
      totalPrice,
      selectedGames: JSON.stringify(selectedGames),
      customerName,
      customerPhone,
      deliveryAddress,
      deliveryCity,
      deliveryPincode,
      deliveryNotes: deliveryNotes ?? null,
      status: 'PENDING',
    } });
    return NextResponse.json({ rental }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'You already have an active rental order. Please wait until it is completed or cancelled.', code: 'ACTIVE_RENTAL_EXISTS' },
        { status: 409 },
      );
    }
    throw error;
  }
}

// GET — fetch user's own rentals
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const page = Number(request.nextUrl.searchParams.get('page') ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
  const pageSize = 25;
  const rentals = await prisma.ps5Rental.findMany({
    where: { userId: session.user.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
  });

  return NextResponse.json({ rentals: rentals.slice(0, pageSize), page, hasMore: rentals.length > pageSize });
}
