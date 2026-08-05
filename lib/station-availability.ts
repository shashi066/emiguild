import {
  PUBLIC_BOOKING_CLOSE_MINUTES,
  PUBLIC_WEEKDAY_OPEN_MINUTES,
  type ActiveSpecialOpening,
  getIndiaClock,
  getPublicBookingHoursForDate,
} from '@/lib/public-booking-time';
import { normalizeVenueCapacity } from '@/lib/booking-availability';

export type AvailabilityState = 'AVAILABLE' | 'OCCUPIED' | 'VENUE_FULL';

export type AvailabilityStation = {
  id: string;
  name: string;
  hasControllers: boolean;
  position: number;
  isActive?: boolean;
};

export type AvailabilityBooking = {
  stationId: string;
  startTime: string;
  endTime: string;
  status?: string;
};

export type LiveStationStatus = {
  id: string;
  name: string;
  hasControllers: boolean;
  position: number;
  state: AvailabilityState;
  availableAt: string | null;
  availableUntil: string | null;
  nextBookingAt: string | null;
  nextAvailableWindow: {
    startTime: string;
    endTime: string;
  } | null;
  /** All confirmed bookings for this station today (for rendering timelines). */
  todaySlots?: { startTime: string; endTime: string }[];
};

export type LiveAvailability = {
  date: string;
  currentTime: string;
  publicOpen: boolean;
  publicHours: {
    opensAt: string;
    closesAt: string;
  };
  nextPublicOpenAt: string;
  specialOpening: ActiveSpecialOpening | null;
  venue: {
    capacity: number;
    occupiedScreens: number;
    freeScreens: number;
  };
  stations: LiveStationStatus[];
};

const CLOSING_MINUTES = PUBLIC_BOOKING_CLOSE_MINUTES;

function parseTime(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours)
    || !Number.isInteger(minutes)
    || hours < 0
    || hours > 24
    || minutes < 0
    || minutes > 59
    || (hours === 24 && minutes !== 0)
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function publicOpeningMinutes(
  date: string,
  specialOpening?: ActiveSpecialOpening | null,
) {
  return getPublicBookingHoursForDate(date, specialOpening)?.openMinutes
    ?? PUBLIC_WEEKDAY_OPEN_MINUTES;
}

type ParsedBooking = AvailabilityBooking & {
  start: number;
  end: number;
};

function parseBookings(bookings: AvailabilityBooking[]) {
  return bookings.flatMap((booking): ParsedBooking[] => {
    if (booking.status === 'CANCELLED') return [];
    const start = parseTime(booking.startTime);
    const end = parseTime(booking.endTime);
    if (start == null || end == null || end <= start) return [];
    return [{ ...booking, start, end }];
  });
}

function isActiveAt(booking: ParsedBooking, minute: number) {
  return booking.start <= minute && minute < booking.end;
}

function stateAt(
  stationId: string,
  minute: number,
  bookings: ParsedBooking[],
  capacity: number,
): AvailabilityState {
  const active = bookings.filter((booking) => isActiveAt(booking, minute));
  if (active.some((booking) => booking.stationId === stationId)) {
    return 'OCCUPIED';
  }
  return active.length >= capacity ? 'VENUE_FULL' : 'AVAILABLE';
}

function changeBoundaries(bookings: ParsedBooking[], currentMinutes: number) {
  return [...new Set([
    ...bookings.flatMap((booking) => [booking.start, booking.end]),
    CLOSING_MINUTES,
  ])]
    .filter((minute) => minute > currentMinutes && minute <= CLOSING_MINUTES)
    .sort((left, right) => left - right);
}

function availableWindows(
  stationId: string,
  currentMinutes: number,
  bookings: ParsedBooking[],
  capacity: number,
) {
  if (currentMinutes >= CLOSING_MINUTES) return [];

  const boundaries = [
    currentMinutes,
    ...changeBoundaries(bookings, currentMinutes),
  ];
  const windows: Array<{ start: number; end: number }> = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (
      end <= start
      || stateAt(stationId, start, bookings, capacity) !== 'AVAILABLE'
    ) {
      continue;
    }

    const previous = windows.at(-1);
    if (previous?.end === start) {
      previous.end = end;
    } else {
      windows.push({ start, end });
    }
  }

  return windows;
}

export function getISTClock(now = new Date()) {
  const clock = getIndiaClock(now);
  return { date: clock.date, time: clock.time };
}

export function buildLiveStationAvailability({
  stations,
  bookings,
  venueCapacity,
  date,
  currentTime,
  specialOpening = null,
}: {
  stations: AvailabilityStation[];
  bookings: AvailabilityBooking[];
  venueCapacity: number;
  date: string;
  currentTime: string;
  specialOpening?: ActiveSpecialOpening | null;
}): LiveAvailability {
  const currentMinutes = parseTime(currentTime) ?? 0;
  const capacity = normalizeVenueCapacity(venueCapacity);
  const parsedBookings = parseBookings(bookings);
  const activeNow = parsedBookings.filter((booking) =>
    isActiveAt(booking, currentMinutes)
  );
  const opensAtMinutes = publicOpeningMinutes(date, specialOpening);
  const publicOpen = (
    currentMinutes >= opensAtMinutes
    && currentMinutes < CLOSING_MINUTES
  );
  const nextOpenDate = currentMinutes < opensAtMinutes ? date : addDays(date, 1);
  const nextOpenMinutes = publicOpeningMinutes(nextOpenDate, specialOpening);

  const stationStatuses = stations
    .filter((station) => station.isActive !== false)
    .sort((left, right) => left.position - right.position)
    .map((station): LiveStationStatus => {
      const state = stateAt(
        station.id,
        currentMinutes,
        parsedBookings,
        capacity,
      );
      const nextBooking = parsedBookings
        .filter((booking) =>
          booking.stationId === station.id
          && booking.start > currentMinutes
          && booking.start < CLOSING_MINUTES
        )
        .sort((left, right) => left.start - right.start)[0];
      const windows = availableWindows(
        station.id,
        currentMinutes,
        parsedBookings,
        capacity,
      );
      const currentWindow = state === 'AVAILABLE' ? windows[0] : null;
      const nextWindow = state === 'AVAILABLE' ? windows[1] : windows[0];

      return {
        id: station.id,
        name: station.name,
        hasControllers: station.hasControllers,
        position: station.position,
        state,
        availableAt: state === 'AVAILABLE' || !nextWindow
          ? null
          : formatTime(nextWindow.start),
        availableUntil: currentWindow == null
          ? null
          : formatTime(currentWindow.end),
        nextBookingAt: nextBooking ? formatTime(nextBooking.start) : null,
        nextAvailableWindow: nextWindow
          ? {
              startTime: formatTime(nextWindow.start),
              endTime: formatTime(nextWindow.end),
            }
          : null,
        todaySlots: parsedBookings
          .filter((b) => b.stationId === station.id)
          .sort((a, b) => a.start - b.start)
          .map((b) => ({ startTime: formatTime(b.start), endTime: formatTime(b.end) })),
      };
    });

  const occupiedScreens = Math.min(activeNow.length, capacity);

  return {
    date,
    currentTime: formatTime(currentMinutes),
    publicOpen,
    publicHours: {
      opensAt: formatTime(opensAtMinutes),
      closesAt: formatTime(CLOSING_MINUTES),
    },
    nextPublicOpenAt:
      `${nextOpenDate}T${formatTime(nextOpenMinutes)}:00+05:30`,
    specialOpening: specialOpening?.date === date ? specialOpening : null,
    venue: {
      capacity,
      occupiedScreens,
      freeScreens: Math.max(0, capacity - occupiedScreens),
    },
    stations: stationStatuses,
  };
}
