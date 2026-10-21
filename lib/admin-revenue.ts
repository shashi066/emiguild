import { prisma } from '@/lib/prisma';

type RevenueRange = { from: string; to: string };

// Keep the existing booking rules. Rentals contribute their stored, discounted
// total once, on their start date, regardless of source or account ownership.
export async function getAdminRevenue(range?: RevenueRange) {
  const dates = range ? { gte: range.from, lte: range.to } : undefined;
  const [bookings, rentals] = await Promise.all([
    prisma.booking.aggregate({
      where: { status: { not: 'CANCELLED' }, ...(dates ? { date: dates } : {}) },
      _sum: { totalPrice: true },
      _count: { _all: true },
    }),
    prisma.ps5Rental.aggregate({
      where: {
        status: { in: ['CONFIRMED', 'DELIVERED', 'RETURNED'] },
        ...(dates ? { startDate: dates } : {}),
      },
      _sum: { totalPrice: true },
      _count: { _all: true },
    }),
  ]);

  const bookingRevenue = bookings._sum.totalPrice ?? 0;
  const rentalRevenue = rentals._sum.totalPrice ?? 0;
  return {
    revenue: bookingRevenue + rentalRevenue,
    bookingRevenue,
    rentalRevenue,
    bookingCount: bookings._count._all,
    rentalCount: rentals._count._all,
  };
}
