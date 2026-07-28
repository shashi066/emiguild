import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  buildLiveStationAvailability,
  getISTClock,
} from '@/lib/station-availability';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date();
    const clock = getISTClock(now);
    const [stations, bookings, capacitySetting] = await Promise.all([
      prisma.station.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          hasControllers: true,
          position: true,
          isActive: true,
        },
        orderBy: { position: 'asc' },
      }),
      prisma.booking.findMany({
        where: {
          date: clock.date,
          status: { not: 'CANCELLED' },
        },
        select: {
          stationId: true,
          startTime: true,
          endTime: true,
          status: true,
        },
      }),
      prisma.setting.findUnique({
        where: { key: 'venue_capacity' },
        select: { value: true },
      }),
    ]);

    const availability = buildLiveStationAvailability({
      stations,
      bookings,
      venueCapacity: Number(capacitySetting?.value ?? 2),
      date: clock.date,
      currentTime: clock.time,
    });

    return NextResponse.json(
      {
        asOf: now.toISOString(),
        ...availability,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error('Station availability failed:', error);
    return NextResponse.json(
      { error: 'Live station availability is temporarily unavailable.' },
      { status: 500 },
    );
  }
}
