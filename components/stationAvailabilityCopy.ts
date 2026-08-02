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

export function shouldDisplayAvailabilityClosed({
  mode,
  publicOpen,
  currentTime,
  closesAt,
}: {
  mode: 'public' | 'admin';
  publicOpen: boolean;
  currentTime: string;
  closesAt: string;
}) {
  if (mode === 'public') return !publicOpen;

  const currentMinutes = timeInMinutes(currentTime);
  const closingMinutes = timeInMinutes(closesAt);
  return currentMinutes !== null
    && closingMinutes !== null
    && currentMinutes >= closingMinutes;
}

function availableWindowCopy(
  window: NonNullable<LiveStationStatus['nextAvailableWindow']>,
  closesAt: string,
) {
  const startsAt = formatTime(window.startTime);
  return window.endTime === closesAt
    ? `from ${startsAt}`
    : `${startsAt} to ${formatTime(window.endTime)}`;
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
      detail: station.nextAvailableWindow
        ? `Free ${availableWindowCopy(station.nextAvailableWindow, closesAt)}`
        : 'Booked through closing',
    };
  }

  if (state === 'VENUE_FULL') {
    return {
      label: 'Venue full',
      detail: station.nextAvailableWindow
        ? `Opening ${availableWindowCopy(station.nextAvailableWindow, closesAt)}`
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
      label: 'Available now',
      detail: station.nextAvailableWindow
        ? `Free until ${restrictionTime}; again ${availableWindowCopy(station.nextAvailableWindow, closesAt)}`
        : station.availableUntil === station.nextBookingAt
          ? `Free until ${restrictionTime}; then reserved`
          : `Free until ${restrictionTime}; then venue full`,
    };
  }

  return {
    label: 'Available now',
    detail: `Open until ${formatTime(closesAt)}`,
  };
}
