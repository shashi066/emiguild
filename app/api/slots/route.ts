import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import {
  getVenueCapacityBlockedIntervals,
  normalizeVenueCapacity,
} from '@/lib/booking-availability';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stationId = searchParams.get('stationId');
  const date      = searchParams.get('date');
  const requestedExclusion = searchParams.get('excludeBookingId');

  if (!stationId || !date) {
    return NextResponse.json({ error: 'stationId and date are required' }, { status: 400 });
  }

  let excludeBookingId: string | undefined;
  if (requestedExclusion) {
    const session = await auth();
    if (session?.user.role === 'ADMIN') excludeBookingId = requestedExclusion;
  }

  // ── Venue capacity ──────────────────────────────────────────────────────
  // How many simultaneous sessions the venue can host (limited by TVs/screens)
  const capacitySetting = await prisma.setting.findUnique({ where: { key: 'venue_capacity' } });
  const venueCapacity = normalizeVenueCapacity(capacitySetting?.value);

  // ── All active bookings for this date across every station ─────────────
  const allBookingsToday = await prisma.booking.findMany({
    where: {
      date,
      status: { not: 'CANCELLED' },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { stationId: true, startTime: true, endTime: true, status: true },
  });

  // ── Bookings specific to this station (always blocked for this station) ─
  const stationBookings = allBookingsToday.filter(b => b.stationId === stationId);

  const capacityBlockedIntervals = getVenueCapacityBlockedIntervals(
    allBookingsToday,
    venueCapacity,
  ).map((interval) => ({ ...interval, status: 'CAPACITY_BLOCKED' }));

  // ── Merge: station's own bookings + capacity-blocked windows ───────────
  // The client uses this combined list to grey out unavailable slots
  const bookings = [
    ...stationBookings,
    ...capacityBlockedIntervals,
  ];

  return NextResponse.json({ bookings, venueCapacity });
}
