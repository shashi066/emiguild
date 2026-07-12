import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stationId = searchParams.get('stationId');
  const date = searchParams.get('date');

  if (!stationId || !date) {
    return NextResponse.json({ error: 'stationId and date are required' }, { status: 400 });
  }

  // Get station details including linked station info
  const station = await prisma.station.findUnique({
    where: { id: stationId },
    select: { linkedStationId: true },
  });

  // Collect all station IDs to check (current station + linked stations)
  const stationIdsToCheck: string[] = [stationId];

  if (station) {
    // Direction 1: This station is linked to another
    if (station.linkedStationId) {
      stationIdsToCheck.push(station.linkedStationId);
    }

    // Direction 2: Check if any station is linked to this one
    const stationsLinkingToThis = await prisma.station.findMany({
      where: { linkedStationId: stationId },
      select: { id: true },
    });
    stationIdsToCheck.push(...stationsLinkingToThis.map(s => s.id));
  }

  // Get bookings for this station AND all linked stations
  const bookings = await prisma.booking.findMany({
    where: {
      stationId: { in: stationIdsToCheck },
      date,
      status: { not: 'CANCELLED' },
    },
    select: {
      startTime: true,
      endTime: true,
      status: true,
    },
  });

  return NextResponse.json({ bookings });
}
