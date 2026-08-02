'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarPlus,
  Clock3,
  Gamepad2,
  Monitor,
  UserPlus,
} from 'lucide-react';
import type { LiveAvailability } from '@/lib/station-availability';
import {
  getStationStatusCopy,
  shouldDisplayAvailabilityClosed,
  type StationDisplayState,
} from '@/components/stationAvailabilityCopy';

type AvailabilityResponse = LiveAvailability & {
  asOf: string;
};

function nextOpeningLabel(value: string) {
  const opening = new Date(value);
  if (Number.isNaN(opening.getTime())) return 'later';
  return opening.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function StationAvailabilityBoard({
  mode,
}: {
  mode: 'public' | 'admin';
}) {
  const [availability, setAvailability] =
    useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let requestInFlight = false;

    const loadAvailability = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await fetch('/api/stations/availability', {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Availability request failed');
        const data = await response.json() as AvailabilityResponse;
        if (!disposed) {
          setAvailability(data);
          setRefreshError(false);
        }
      } catch {
        if (!disposed) setRefreshError(true);
      } finally {
        requestInFlight = false;
        if (!disposed) setLoading(false);
      }
    };

    const startPolling = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
      if (document.visibilityState === 'visible') {
        timer = window.setInterval(loadAvailability, 60_000);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadAvailability();
      }
      startPolling();
    };
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        void loadAvailability();
      }
    };

    void loadAvailability();
    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      disposed = true;
      if (timer !== undefined) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const board = (() => {
    if (loading && !availability) {
      return (
        <div className="station-availability-state" aria-live="polite">
          <Monitor size={18} />
          Checking live stations...
        </div>
      );
    }

    if (!availability) {
      return (
        <div className="station-availability-state error" role="status">
          Live station status is temporarily unavailable.
        </div>
      );
    }

    const boardClosed = shouldDisplayAvailabilityClosed({
      mode,
      publicOpen: availability.publicOpen,
      currentTime: availability.currentTime,
      closesAt: availability.publicHours.closesAt,
    });
    const openingLabel = nextOpeningLabel(availability.nextPublicOpenAt);
    const venueLabel = boardClosed
      ? `Closed now · Opens ${openingLabel}`
      : availability.venue.freeScreens === 0
        ? `All ${availability.venue.capacity} screens occupied`
        : `${availability.venue.freeScreens} of ${availability.venue.capacity} screens available`;
    const updatedLabel = new Date(availability.asOf).toLocaleTimeString(
      'en-IN',
      {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
      },
    );

    return (
      <>
        <div className="station-availability-heading">
          <div>
            <div className="station-availability-title">
              <Monitor size={19} />
              <h2>Live Station Availability</h2>
            </div>
            <p className="station-availability-meta" aria-live="polite">
              {venueLabel}
              <span aria-hidden="true">·</span>
              {refreshError ? 'Update delayed' : `Updated ${updatedLabel}`}
            </p>
          </div>

          <div className="station-availability-actions">
            {mode === 'public' ? (
              <Link href="/book" className="btn btn-primary btn-sm">
                <CalendarPlus size={15} />
                Book a Slot
              </Link>
            ) : (
              <>
                <Link href="/admin/walkin" className="btn btn-primary btn-sm">
                  <UserPlus size={15} />
                  Walk-in
                </Link>
                <Link href="/admin/bookings" className="btn btn-ghost btn-sm">
                  All Bookings
                  <ArrowRight size={14} />
                </Link>
              </>
            )}
          </div>
        </div>

        {availability.stations.length === 0 ? (
          <div className="station-availability-state">
            No active stations are configured.
          </div>
        ) : (
          <div className="station-availability-list">
            {availability.stations.map((station) => {
              const displayState: StationDisplayState = boardClosed
                ? 'CLOSED'
                : station.state;
              const copy = getStationStatusCopy(
                station,
                displayState,
                openingLabel,
                availability.publicHours.closesAt,
              );

              return (
                <div
                  className="station-availability-row"
                  data-state={displayState}
                  key={station.id}
                >
                  <span className="station-availability-dot" aria-hidden="true" />
                  <div className="station-availability-station">
                    <strong>{station.name}</strong>
                    <span>
                      <Gamepad2 size={12} aria-hidden="true" />
                      {station.hasControllers
                        ? 'PlayStation'
                        : 'Racing simulator'}
                    </span>
                  </div>
                  <div className="station-availability-status">
                    <strong>{copy.label}</strong>
                    <span>
                      <Clock3 size={11} aria-hidden="true" />
                      {copy.detail}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  })();

  if (mode === 'public') {
    return (
      <section
        id="live-station-availability"
        className="station-availability-band"
        aria-label="Live station availability"
      >
        <div className="container">
          <div className="station-availability-board">{board}</div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="station-availability-board station-availability-admin"
      aria-label="Live station availability"
    >
      {board}
    </section>
  );
}
