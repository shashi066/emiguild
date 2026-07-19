import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

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
  const venueCapacity   = parseInt(capacitySetting?.value ?? '2');

  // ── All active bookings for this date across every station ─────────────
  const allBookingsToday = await prisma.booking.findMany({
    where: {
      date,
      status: { not: 'CANCELLED' },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { stationId: true, startTime: true, endTime: true },
  });

  // ── Bookings specific to this station (always blocked for this station) ─
  const stationBookings = allBookingsToday.filter(b => b.stationId === stationId);

  // ── Find exact time windows where venue is at full capacity ────────────
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toTime = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };
  const capacityBlockedIntervals: { startTime: string; endTime: string }[] = [];

  // Booking boundaries divide the day into segments with constant occupancy.
  // End times are exclusive, so a TV is available immediately when a booking ends.
  const occupancyChanges = new Map<number, number>();
  for (const booking of allBookingsToday) {
    const start = toMins(booking.startTime);
    const end = toMins(booking.endTime);
    occupancyChanges.set(start, (occupancyChanges.get(start) ?? 0) + 1);
    occupancyChanges.set(end, (occupancyChanges.get(end) ?? 0) - 1);
  }
  const boundaries = [...occupancyChanges.keys()].sort((a, b) => a - b);
  let occupied = 0;

  for (let index = 0; index < boundaries.length - 1; index++) {
    const segmentStart = boundaries[index];
    const segmentEnd = boundaries[index + 1];
    occupied += occupancyChanges.get(segmentStart) ?? 0;

    if (occupied >= venueCapacity) {
      const previous = capacityBlockedIntervals.at(-1);
      const startTime = toTime(segmentStart);
      const endTime = toTime(segmentEnd);

      if (previous?.endTime === startTime) {
        previous.endTime = endTime;
      } else {
        capacityBlockedIntervals.push({ startTime, endTime });
      }
    }
  }

  // ── Merge: station's own bookings + capacity-blocked windows ───────────
  // The client uses this combined list to grey out unavailable slots
  const bookings = [
    ...stationBookings,
    ...capacityBlockedIntervals,
  ];

  return NextResponse.json({ bookings, venueCapacity });
}
