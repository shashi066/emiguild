import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLiveStationAvailability,
  getISTClock,
} from '../../lib/station-availability';

const stations = [
  {
    id: 'ps5-a',
    name: 'PS5 Alpha',
    hasControllers: true,
    position: 1,
    isActive: true,
  },
  {
    id: 'ps5-b',
    name: 'PS5 Beta',
    hasControllers: true,
    position: 2,
    isActive: true,
  },
  {
    id: 'racing',
    name: 'Apex Racing Simulator Pro',
    hasControllers: false,
    position: 3,
    isActive: true,
  },
];

test('uses IST for the endpoint clock', () => {
  assert.deepEqual(
    getISTClock(new Date('2026-07-28T12:30:15.000Z')),
    { date: '2026-07-28', time: '18:00' },
  );
});

test('marks the third station full only during the exact two-TV overlap', () => {
  const bookings = [
    {
      stationId: 'ps5-a',
      startTime: '16:30',
      endTime: '17:30',
      status: 'CONFIRMED',
    },
    {
      stationId: 'ps5-b',
      startTime: '17:00',
      endTime: '18:00',
      status: 'CONFIRMED',
    },
  ];

  const duringOverlap = buildLiveStationAvailability({
    stations,
    bookings,
    venueCapacity: 2,
    date: '2026-07-28',
    currentTime: '17:15',
  });
  const racingDuringOverlap = duringOverlap.stations.find(
    (station) => station.id === 'racing',
  );

  assert.equal(duringOverlap.venue.freeScreens, 0);
  assert.equal(racingDuringOverlap?.state, 'VENUE_FULL');
  assert.equal(racingDuringOverlap?.availableAt, '17:30');
  assert.deepEqual(racingDuringOverlap?.nextAvailableWindow, {
    startTime: '17:30',
    endTime: '23:00',
  });

  const atExactEnd = buildLiveStationAvailability({
    stations,
    bookings,
    venueCapacity: 2,
    date: '2026-07-28',
    currentTime: '17:30',
  });
  const racingAtExactEnd = atExactEnd.stations.find(
    (station) => station.id === 'racing',
  );

  assert.equal(atExactEnd.venue.freeScreens, 1);
  assert.equal(racingAtExactEnd?.state, 'AVAILABLE');
});

test('merges contiguous station bookings when calculating the free time', () => {
  const availability = buildLiveStationAvailability({
    stations,
    venueCapacity: 2,
    date: '2026-07-28',
    currentTime: '16:30',
    bookings: [
      {
        stationId: 'ps5-a',
        startTime: '16:00',
        endTime: '17:00',
        status: 'CHECKED_IN',
      },
      {
        stationId: 'ps5-a',
        startTime: '17:00',
        endTime: '18:00',
        status: 'CONFIRMED',
      },
    ],
  });

  const alpha = availability.stations.find(
    (station) => station.id === 'ps5-a',
  );
  assert.equal(alpha?.state, 'OCCUPIED');
  assert.equal(alpha?.availableAt, '18:00');
  assert.deepEqual(alpha?.nextAvailableWindow, {
    startTime: '18:00',
    endTime: '23:00',
  });
});

test('reports how long an available station remains usable', () => {
  const availability = buildLiveStationAvailability({
    stations,
    venueCapacity: 2,
    date: '2026-07-28',
    currentTime: '16:30',
    bookings: [
      {
        stationId: 'ps5-a',
        startTime: '17:00',
        endTime: '18:00',
        status: 'CONFIRMED',
      },
    ],
  });

  const alpha = availability.stations.find(
    (station) => station.id === 'ps5-a',
  );
  assert.equal(alpha?.state, 'AVAILABLE');
  assert.equal(alpha?.availableUntil, '17:00');
  assert.equal(alpha?.nextBookingAt, '17:00');
  assert.deepEqual(alpha?.nextAvailableWindow, {
    startTime: '18:00',
    endTime: '23:00',
  });
});

test('ignores cancelled bookings but includes frozen slots', () => {
  const availability = buildLiveStationAvailability({
    stations,
    venueCapacity: 2,
    date: '2026-07-28',
    currentTime: '17:15',
    bookings: [
      {
        stationId: 'ps5-a',
        startTime: '17:00',
        endTime: '18:00',
        status: 'CANCELLED',
      },
      {
        stationId: 'ps5-b',
        startTime: '17:00',
        endTime: '18:00',
        status: 'BLOCKED',
      },
    ],
  });

  assert.equal(availability.venue.occupiedScreens, 1);
  assert.equal(
    availability.stations.find((station) => station.id === 'ps5-a')?.state,
    'AVAILABLE',
  );
  assert.equal(
    availability.stations.find((station) => station.id === 'ps5-b')?.state,
    'OCCUPIED',
  );
});

test('uses weekday and weekend public opening hours', () => {
  const weekday = buildLiveStationAvailability({
    stations,
    bookings: [],
    venueCapacity: 2,
    date: '2026-07-28',
    currentTime: '15:59',
  });
  const weekend = buildLiveStationAvailability({
    stations,
    bookings: [],
    venueCapacity: 2,
    date: '2026-08-01',
    currentTime: '11:00',
  });
  const atClose = buildLiveStationAvailability({
    stations,
    bookings: [],
    venueCapacity: 2,
    date: '2026-08-01',
    currentTime: '23:00',
  });

  assert.equal(weekday.publicHours.opensAt, '16:00');
  assert.equal(weekday.publicOpen, false);
  assert.equal(weekend.publicHours.opensAt, '11:00');
  assert.equal(weekend.publicOpen, true);
  assert.equal(atClose.publicOpen, false);
});

test('excludes inactive stations and falls back to capacity two', () => {
  const availability = buildLiveStationAvailability({
    stations: [
      ...stations,
      {
        id: 'inactive',
        name: 'Inactive',
        hasControllers: true,
        position: 4,
        isActive: false,
      },
    ],
    bookings: [],
    venueCapacity: Number.NaN,
    date: '2026-07-28',
    currentTime: '17:00',
  });

  assert.equal(availability.venue.capacity, 2);
  assert.equal(availability.stations.length, 3);
  assert.equal(
    availability.stations.some((station) => station.id === 'inactive'),
    false,
  );
});

test('returns only public station and timing fields', () => {
  const availability = buildLiveStationAvailability({
    stations,
    bookings: [{
      stationId: 'ps5-a',
      startTime: '17:00',
      endTime: '18:00',
      status: 'CONFIRMED',
    }],
    venueCapacity: 2,
    date: '2026-07-28',
    currentTime: '17:15',
  });

  assert.deepEqual(
    Object.keys(availability.stations[0]).sort(),
    [
      'availableAt',
      'availableUntil',
      'hasControllers',
      'id',
      'name',
      'nextAvailableWindow',
      'nextBookingAt',
      'position',
      'state',
    ],
  );
});
