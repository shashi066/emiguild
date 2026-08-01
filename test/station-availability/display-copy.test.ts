import assert from 'node:assert/strict';
import test from 'node:test';
import { getStationStatusCopy } from '../../components/stationAvailabilityCopy';
import { shouldDisplayAvailabilityClosed } from '../../components/stationAvailabilityCopy';
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
    nextAvailableWindow: null,
    ...overrides,
  };
}

test('describes a direct upcoming reservation', () => {
  const copy = getStationStatusCopy(
    availableStation({
      availableUntil: '16:30',
      nextBookingAt: '16:30',
      nextAvailableWindow: {
        startTime: '17:30',
        endTime: '23:00',
      },
    }),
    'AVAILABLE',
    'Fri, 4:00 PM',
    '23:00',
  );

  assert.deepEqual(copy, {
    label: 'Available now',
    detail: 'Free until 4:30 PM; again from 5:30 PM',
  });
});

test('describes an upcoming venue-capacity restriction', () => {
  const copy = getStationStatusCopy(
    availableStation({
      availableUntil: '19:00',
      nextBookingAt: '20:00',
      nextAvailableWindow: {
        startTime: '20:00',
        endTime: '21:00',
      },
    }),
    'AVAILABLE',
    'Fri, 4:00 PM',
    '23:00',
  );

  assert.deepEqual(copy, {
    label: 'Available now',
    detail: 'Free until 7:00 PM; again 8:00 PM to 9:00 PM',
  });
});

test('shows the complete next opening while a station is occupied', () => {
  const copy = getStationStatusCopy(
    availableStation({
      state: 'OCCUPIED',
      availableAt: '17:30',
      availableUntil: null,
      nextAvailableWindow: {
        startTime: '17:30',
        endTime: '19:00',
      },
    }),
    'OCCUPIED',
    'Fri, 4:00 PM',
    '23:00',
  );

  assert.deepEqual(copy, {
    label: 'In session',
    detail: 'Free 5:30 PM to 7:00 PM',
  });
});

test('keeps early operational status visible to admins', () => {
  assert.equal(shouldDisplayAvailabilityClosed({
    mode: 'public',
    publicOpen: false,
    currentTime: '10:00',
    closesAt: '23:00',
  }), true);
  assert.equal(shouldDisplayAvailabilityClosed({
    mode: 'admin',
    publicOpen: false,
    currentTime: '10:00',
    closesAt: '23:00',
  }), false);
  assert.equal(shouldDisplayAvailabilityClosed({
    mode: 'admin',
    publicOpen: false,
    currentTime: '23:00',
    closesAt: '23:00',
  }), true);
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
