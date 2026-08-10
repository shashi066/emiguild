'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarPlus,
  Gamepad2,
  Monitor,
  UserPlus,
} from 'lucide-react';
import type { LiveAvailability, LiveStationStatus } from '@/lib/station-availability';
import { getSpecialOpeningNotice } from '@/lib/public-booking-time';
import { shouldDisplayAvailabilityClosed } from '@/components/stationAvailabilityCopy';

type AvailabilityResponse = LiveAvailability & { asOf: string };

// ── Time helpers ───────────────────────────────────────────────────────────────
function toMins(t: string): number {
  const [hStr = '0', mStr = '0'] = t.split(':');
  return Number(hStr) * 60 + Number(mStr);
}

function formatMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function posPct(mins: number, startMins: number, endMins: number): string {
  const v = Math.max(0, Math.min(100, ((mins - startMins) / (endMins - startMins)) * 100));
  return `${v.toFixed(2)}%`;
}

function widthPct(s: number, e: number, startMins: number, endMins: number): string {
  const cs = Math.max(s, startMins);
  const ce = Math.min(e, endMins);
  const v  = Math.max(0, ((ce - cs) / (endMins - startMins)) * 100);
  return `${v.toFixed(2)}%`;
}

function fmtAmPm(time: string): string {
  const [hStr = '0', mStr = '0'] = time.split(':');
  const h      = Number(hStr);
  const m      = Number(mStr);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12    = h % 12 || 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function nextOpeningLabel(value: string) {
  const opening = new Date(value);
  if (Number.isNaN(opening.getTime())) return 'later';
  return opening.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour:    'numeric',
    minute:  '2-digit',
  });
}

function minutesFromTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours   = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Returns intervals where the venue is at full capacity but this station
 * has no direct booking — blocked by venue-wide capacity.
 */
function computeVenueLimitedPeriods(
  stationId: string,
  allSlots:  { stationId: string; startTime: string; endTime: string }[],
  capacity:  number,
  opensAt:   string,
  closesAt:  string,
): { startTime: string; endTime: string }[] {
  const openMins  = toMins(opensAt);
  const closeMins = toMins(closesAt);

  const boundaries = new Set<number>([openMins, closeMins]);
  allSlots.forEach((slot) => {
    const s = toMins(slot.startTime);
    const e = toMins(slot.endTime);
    if (s >= openMins && s <= closeMins) boundaries.add(s);
    if (e >= openMins && e <= closeMins) boundaries.add(e);
  });

  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const result: { startTime: string; endTime: string }[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const mid            = (sorted[i] + sorted[i + 1]) / 2;
    const activeBookings = allSlots.filter((slot) => {
      const s = toMins(slot.startTime);
      const e = toMins(slot.endTime);
      return mid >= s && mid < e;
    });
    const stationBooked = activeBookings.some((b) => b.stationId === stationId);

    if (activeBookings.length >= capacity && !stationBooked) {
      const start = sorted[i];
      const end   = sorted[i + 1];
      const last  = result[result.length - 1];
      if (last && toMins(last.endTime) === start) {
        last.endTime = formatMins(end);
      } else {
        result.push({ startTime: formatMins(start), endTime: formatMins(end) });
      }
    }
  }
  return result;
}

// ── GanttChart ─────────────────────────────────────────────────────────────────
const ROW_H    = 54;
const LABEL_W  = 136;
const HEADER_H = 26;

function GanttChart({
  stations,
  opensAt,
  closesAt,
  currentTime,
  boardClosed,
  venueCapacity,
  ganttStartMins,
  showAllHours,
}: {
  stations:       LiveStationStatus[];
  opensAt:        string;
  closesAt:       string;
  currentTime:    string;
  boardClosed:    boolean;
  venueCapacity:  number;
  /** Left-edge override — pass current hour for the public view */
  ganttStartMins?: number;
  /** When true every hour gets its own tick label (admin view). Public uses adaptive step. */
  showAllHours?: boolean;
}) {
  const openMins  = toMins(opensAt);
  const closeMins = toMins(closesAt);
  const nowMins   = toMins(currentTime);
  const startMins = ganttStartMins ?? openMins;
  // Adaptive ticks — at most ~6 labels to avoid crowding
  const totalHours = Math.ceil((closeMins - startMins) / 60);
  const stepHours = showAllHours ? 1 : (totalHours <= 6 ? 1 : Math.ceil(totalHours / 5));
  const stepMins   = stepHours * 60;

  const hourTicks: number[] = [];
  for (let m = startMins; m <= closeMins; m += stepMins) hourTicks.push(m);
  if (hourTicks[hourTicks.length - 1] !== closeMins) hourTicks.push(closeMins);

  const showNow = !boardClosed && nowMins >= startMins && nowMins <= closeMins;

  // 90 px per hour keeps labels and blocks readable; container scrolls when needed
  const PX_PER_HOUR    = 90;
  const timelineMinPx  = Math.max(400, totalHours * PX_PER_HOUR);
  const ganttMinWidth  = LABEL_W + timelineMinPx;

  // Flatten all slots for venue-capacity computation
  const allSlots = stations.flatMap((st) =>
    (st.todaySlots ?? []).map((slot) => ({ ...slot, stationId: st.id }))
  );

  return (
    <div className="gantt-wrap">
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ minWidth: ganttMinWidth }}>

          {/* ── Header tick labels ── */}
          <div style={{ display: 'flex', height: HEADER_H, alignItems: 'flex-end', paddingBottom: 4 }}>
            <div style={{ width: LABEL_W, flexShrink: 0 }} />
            <div style={{ flex: 1, position: 'relative', height: '100%' }}>
              {hourTicks.map((m) => (
                <span key={m} style={{
                  position:  'absolute',
                  left:      posPct(m, startMins, closeMins),
                  transform: 'translateX(-50%)',
                  bottom:    2,
                  fontSize:  '0.65rem',
                  color:     'var(--color-text-muted)',
                  whiteSpace:'nowrap',
                  userSelect:'none',
                }}>
                  {fmtAmPm(formatMins(m))}
                </span>
              ))}
            </div>
          </div>

          {/* ── Station rows ── */}
          {stations.map((station, idx) => {
            const venueLimited = computeVenueLimitedPeriods(
              station.id, allSlots, venueCapacity, opensAt, closesAt,
            ).filter((slot) => toMins(slot.endTime) > startMins && toMins(slot.startTime) < closeMins);

            return (
              <div
                key={station.id}
                style={{
                  display:    'flex',
                  alignItems: 'center',
                  height:      ROW_H,
                  borderTop:  `1px solid rgba(255,255,255,${idx === 0 ? 0.1 : 0.05})`,
                }}
              >
                {/* Station label */}
                <div style={{ width: LABEL_W, flexShrink: 0, paddingRight: 14 }}>
                  <div style={{
                    fontSize:     '0.8rem',
                    fontWeight:   600,
                    whiteSpace:   'nowrap',
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    color:        'var(--color-text-primary)',
                  }}>
                    {station.name}
                  </div>
                  <div style={{
                    fontSize:   '0.62rem',
                    color:      station.hasControllers ? 'var(--color-accent-secondary)' : 'var(--color-accent-warning)',
                    display:    'flex',
                    alignItems: 'center',
                    gap:        3,
                    marginTop:  3,
                  }}>
                    <Gamepad2 size={10} />
                    {station.hasControllers ? 'PlayStation' : 'Racing sim'}
                  </div>
                </div>

                {/* Timeline bar — plain background */}
                <div style={{
                  flex:         1,
                  position:    'relative',
                  height:       32,
                  borderRadius: 5,
                  background:  'rgba(255,255,255,0.04)',
                  border:      '1px solid rgba(255,255,255,0.06)',
                }}>
                  {/* Hour grid lines */}
                  {hourTicks.slice(1, -1).map((m) => (
                    <div key={m} style={{
                      position:      'absolute',
                      left:          posPct(m, startMins, closeMins),
                      top: 0, bottom: 0, width: 1,
                      background:    'rgba(255,255,255,0.05)',
                      pointerEvents: 'none',
                    }} />
                  ))}

                  {/* Venue-limited blocks (amber) */}
                  {venueLimited.map((slot, i) => (
                    <div
                      key={`vl-${i}`}
                      title={`Venue full: ${fmtAmPm(slot.startTime)} – ${fmtAmPm(slot.endTime)}`}
                      style={{
                        position:     'absolute',
                        left:         posPct(toMins(slot.startTime), startMins, closeMins),
                        width:        widthPct(toMins(slot.startTime), toMins(slot.endTime), startMins, closeMins),
                        top: 3, bottom: 3,
                        background:   'rgba(255,170,0,0.22)',
                        borderRadius: 4,
                        border:       '1px solid rgba(255,170,0,0.45)',
                        cursor:       'default',
                        display:      'flex',
                        alignItems:   'center',
                        paddingLeft:  5,
                        overflow:     'hidden',
                      }}
                    >
                      <span style={{ fontSize: '0.58rem', color: 'var(--color-accent-warning)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Venue full
                      </span>
                    </div>
                  ))}

                  {/* Booked blocks (red) */}
                  {(station.todaySlots ?? [])
                    .filter((slot) => toMins(slot.endTime) > startMins && toMins(slot.startTime) < closeMins)
                    .map((slot, i) => {
                      const s      = toMins(slot.startTime);
                      const e      = toMins(slot.endTime);
                    return (
                      <div
                        key={i}
                        title={`${fmtAmPm(slot.startTime)} – ${fmtAmPm(slot.endTime)}`}
                        style={{
                          position:     'absolute',
                          left:         posPct(s, startMins, closeMins),
                          width:        widthPct(s, e, startMins, closeMins),
                          top: 3, bottom: 3,
                          background:   'rgba(255,64,64,0.18)',
                          borderRadius: 4,
                          border:       '1px solid rgba(255,64,64,0.25)',
                          display:      'flex',
                          alignItems:   'center',
                          paddingLeft:  6,
                          overflow:     'hidden',
                          cursor:       'default',
                          zIndex:       1,
                        }}
                      >
                        <span style={{
                          fontSize:     '0.6rem',
                          color:        'rgba(255,255,255,0.7)',
                          whiteSpace:   'nowrap',
                          overflow:     'hidden',
                          textOverflow: 'ellipsis',
                          fontWeight:   400,
                        }}>
                          {fmtAmPm(slot.startTime)}–{fmtAmPm(slot.endTime)}
                        </span>
                      </div>
                    );
                  })}

                  {/* Now line */}
                  {showNow && (
                    <div style={{
                      position:     'absolute',
                      left:         posPct(nowMins, startMins, closeMins),
                      top: -4, bottom: -4, width: 2,
                      background:   'rgba(255,255,255,0.88)',
                      borderRadius: 1,
                      zIndex:       3,
                      boxShadow:    '0 0 6px rgba(255,255,255,0.4)',
                      pointerEvents:'none',
                    }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', marginTop: 'var(--space-md)', fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 10, borderRadius: 2, background: 'rgba(255,64,64,0.18)', border: '1px solid rgba(255,64,64,0.25)', display: 'inline-block' }} />
          Booked
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 10, borderRadius: 2, background: 'rgba(255,170,0,0.22)', border: '1px solid rgba(255,170,0,0.45)', display: 'inline-block' }} />
          Venue at capacity
        </span>
        {showNow && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 2, height: 12, background: 'rgba(255,255,255,0.88)', display: 'inline-block', borderRadius: 1 }} />
            Now
          </span>
        )}
      </div>


    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function StationAvailabilityBoard({ mode }: { mode: 'public' | 'admin' }) {
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshError, setRefreshError] = useState(false);

  useEffect(() => {
    let disposed        = false;
    let timer: number | undefined;
    let requestInFlight = false;

    const loadAvailability = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const res  = await fetch('/api/stations/availability', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json() as AvailabilityResponse;
        if (!disposed) { setAvailability(data); setRefreshError(false); }
      } catch {
        if (!disposed) setRefreshError(true);
      } finally {
        requestInFlight = false;
        if (!disposed)  setLoading(false);
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
      if (document.visibilityState === 'visible') void loadAvailability();
      startPolling();
    };
    const handleFocus = () => {
      if (document.visibilityState === 'visible') void loadAvailability();
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

  // ── Build board content ──────────────────────────────────────────────────────
  const board = (() => {
    if (loading && !availability) {
      return (
        <div className="station-availability-state" aria-live="polite">
          <Monitor size={18} /> Checking live stations...
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
      publicOpen:  availability.publicOpen,
      currentTime: availability.currentTime,
      closesAt:    availability.publicHours.closesAt,
    });

    const openingLabel         = nextOpeningLabel(availability.nextPublicOpenAt);
    const specialOpeningNotice = getSpecialOpeningNotice(
      availability.specialOpening,
      minutesFromTime(availability.currentTime) ?? 0,
    );
    const venueLabel = specialOpeningNotice
      ? `${specialOpeningNotice.title} · ${specialOpeningNotice.detail}`
      : boardClosed
      ? `Closed now · Opens ${openingLabel}`
      : availability.venue.freeScreens === 0
        ? `All ${availability.venue.capacity} screens occupied`
        : `${availability.venue.freeScreens} of ${availability.venue.capacity} screens available`;

    const updatedLabel = new Date(availability.asOf).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit',
    });

    // Public view starts from the current hour; admin shows the full day
    const nowMins      = toMins(availability.currentTime);
    const openMins     = toMins(availability.publicHours.opensAt);
    const publicStart  = Math.max(openMins, Math.floor(nowMins / 60) * 60);

    const ganttChart = availability.stations.length === 0 ? (
      <div className="station-availability-state">
        No active stations are configured.
      </div>
    ) : (
      <GanttChart
        stations={availability.stations}
        opensAt={availability.publicHours.opensAt}
        closesAt={availability.publicHours.closesAt}
        currentTime={availability.currentTime}
        boardClosed={boardClosed}
        venueCapacity={availability.venue.capacity}
        ganttStartMins={mode === 'public' ? publicStart : undefined}
        showAllHours={true}
      />
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
                <CalendarPlus size={15} /> Book a Slot
              </Link>
            ) : (
              <>
                <Link href="/admin/walkin" className="btn btn-primary btn-sm">
                  <UserPlus size={15} /> Walk-in
                </Link>
                <Link href="/admin/bookings" className="btn btn-ghost btn-sm">
                  All Bookings <ArrowRight size={14} />
                </Link>
              </>
            )}
          </div>
        </div>

        {ganttChart}
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
