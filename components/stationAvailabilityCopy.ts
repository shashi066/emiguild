import { formatTime } from '@/lib/utils';
import type {
  AvailabilityState,
  LiveStationStatus,
} from '@/lib/station-availability';

export type StationDisplayState = AvailabilityState | 'CLOSED';

function timeInMinutes(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function getStationStatusCopy(
  station: LiveStationStatus,
  state: StationDisplayState,
  nextOpening: string,
  closesAt: string,
) {
  if (state === 'CLOSED') {
    return {
      label: 'Closed',
      detail: `Opens ${nextOpening}`,
    };
  }

  if (state === 'OCCUPIED') {
    return {
      label: 'In session',
      detail: station.availableAt
        ? `Free at ${formatTime(station.availableAt)}`
        : 'Booked through closing',
    };
  }

  if (state === 'VENUE_FULL') {
    return {
      label: 'Venue full',
      detail: station.availableAt
        ? `Capacity opens at ${formatTime(station.availableAt)}`
        : 'No opening before close',
    };
  }

  const availableUntilMinutes = station.availableUntil
    ? timeInMinutes(station.availableUntil)
    : null;
  const closingMinutes = timeInMinutes(closesAt);
  const hasEarlierRestriction = (
    station.availableUntil !== null
    && availableUntilMinutes !== null
    && closingMinutes !== null
    && availableUntilMinutes < closingMinutes
  );

  if (hasEarlierRestriction && station.availableUntil) {
    const restrictionTime = formatTime(station.availableUntil);
    return {
      label: `Available until ${restrictionTime}`,
      detail: station.availableUntil === station.nextBookingAt
        ? `Reserved from ${restrictionTime}`
        : `Venue full from ${restrictionTime}`,
    };
  }

  return {
    label: 'Available now',
    detail: `Open until ${formatTime(closesAt)}`,
  };
}
