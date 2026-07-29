import assert from 'node:assert/strict';
import test from 'node:test';
import { getStationStatusCopy } from '../../components/stationAvailabilityCopy';
import type { LiveStationStatus } from '../../lib/station-availability';

function availableStation(
  overrides: Partial<LiveStationStatus> = {},
): LiveStationStatus {
  return {
    id: 'ps5-a',
    name: 'PS5 Alpha',
    hasControllers: true,
    position: 1,
    state: 'AVAILABLE',
    availableAt: null,
    availableUntil: '23:00',
    nextBookingAt: null,
    ...overrides,
  };
}

test('describes a direct upcoming reservation', () => {
  const copy = getStationStatusCopy(
    availableStation({
      availableUntil: '19:00',
      nextBookingAt: '19:00',
    }),
    'AVAILABLE',
    'Fri, 4:00 PM',
    '23:00',
  );

  assert.deepEqual(copy, {
    label: 'Available until 7:00 PM',
    detail: 'Reserved from 7:00 PM',
  });
});

test('describes an upcoming venue-capacity restriction', () => {
  const copy = getStationStatusCopy(
    availableStation({
      availableUntil: '19:00',
      nextBookingAt: '20:00',
    }),
    'AVAILABLE',
    'Fri, 4:00 PM',
    '23:00',
  );

  assert.deepEqual(copy, {
    label: 'Available until 7:00 PM',
    detail: 'Venue full from 7:00 PM',
  });
});

test('describes availability through public closing', () => {
  const copy = getStationStatusCopy(
    availableStation(),
    'AVAILABLE',
    'Fri, 4:00 PM',
    '23:00',
  );

  assert.deepEqual(copy, {
    label: 'Available now',
    detail: 'Open until 11:00 PM',
  });
});

test('closed state overrides a station availability state', () => {
  const copy = getStationStatusCopy(
    availableStation({
      availableUntil: '19:00',
      nextBookingAt: '19:00',
    }),
    'CLOSED',
    'Fri, 4:00 PM',
    '23:00',
  );

  assert.deepEqual(copy, {
    label: 'Closed',
    detail: 'Opens Fri, 4:00 PM',
  });
});
