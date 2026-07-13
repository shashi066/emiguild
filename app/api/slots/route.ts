import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stationId = searchParams.get('stationId');
  const date      = searchParams.get('date');

  if (!stationId || !date) {
    return NextResponse.json({ error: 'stationId and date are required' }, { status: 400 });
  }

  // ── Venue capacity ──────────────────────────────────────────────────────
  // How many simultaneous sessions the venue can host (limited by TVs/screens)
  const capacitySetting = await prisma.setting.findUnique({ where: { key: 'venue_capacity' } });
  const venueCapacity   = parseInt(capacitySetting?.value ?? '2');

  // ── All active bookings for this date across every station ─────────────
  const allBookingsToday = await prisma.booking.findMany({
    where: { date, status: { not: 'CANCELLED' } },
    select: { stationId: true, startTime: true, endTime: true },
  });

  // ── Bookings specific to this station (always blocked for this station) ─
  const stationBookings = allBookingsToday.filter(b => b.stationId === stationId);

  // ── Find time windows where venue is at full capacity ──────────────────
  // Build a list of all unique start/end times across all stations
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  // For each minute-granularity check we use start/end pairs.
  // A slot is "capacity-blocked" if the number of overlapping bookings
  // across ALL stations >= venueCapacity.
  // We expose these as "blocked" intervals so the client can grey them out.
  const capacityBlockedIntervals: { startTime: string; endTime: string }[] = [];

  // Collect all distinct intervals where the venue is at capacity
  const allIntervals = allBookingsToday.map(b => ({
    start: toMins(b.startTime),
    end:   toMins(b.endTime),
    startTime: b.startTime,
    endTime:   b.endTime,
  }));

  // For each booking interval, count how many other bookings overlap it
  // If the count reaches venueCapacity, this window is capacity-blocked
  const seenKeys = new Set<string>();
  for (const interval of allIntervals) {
    const key = `${interval.startTime}-${interval.endTime}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const overlapping = allBookingsToday.filter(b => {
      const bStart = toMins(b.startTime);
      const bEnd   = toMins(b.endTime);
      return interval.start < bEnd && interval.end > bStart;
    });

    if (overlapping.length >= venueCapacity) {
      capacityBlockedIntervals.push({ startTime: interval.startTime, endTime: interval.endTime });
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
