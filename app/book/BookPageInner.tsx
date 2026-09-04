'use client';

import { Fragment, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  Calendar, Monitor, Clock, CheckCircle, ChevronRight,
  ChevronLeft, AlertCircle, Snowflake, Gamepad2, Plus, Minus, Award, ArrowLeft,
} from 'lucide-react';
import {
  CLOSING_HOUR, formatTime, formatDate,
  formatCurrency, isSlotAvailable, addHours, getTimeSlotsForDate,
  getDurationOptions,
} from '@/lib/utils';
import {
  addIndiaCalendarDays,
  getActiveSpecialOpening,
  getIndiaClock,
  getSpecialOpeningNotice,
} from '@/lib/public-booking-time';
import { isPassDateEligible } from '@/lib/pass-rules';
import {
  GUILD_MEMBERSHIP_DISCOUNT_PERCENTAGE,
  getGuildMembershipEligibility,
  getGuildMembershipDiscountedTotal,
  guildMembershipName,
  isGuildMembershipType,
  selectPreferredGuildMembership,
} from '@/lib/guild-membership';
import { CUSTOMER_GAME_REQUEST_MAX_LENGTH } from '@/lib/game-request';

type Station = {
  id: string;
  name: string;
  description: string;
  specs: string;
  hourlyRate: number;
  minDuration: number;
  hasControllers: boolean;
  position: number;
};

type BookedSlot = { startTime: string; endTime: string; status: string };
type BookingBenefitMode = 'STANDARD' | 'HOUR_PASS' | 'GUILD';

const STATION_ICONS: Record<number, string> = {
  1: '🖥️', 2: '💻', 3: '🎮', 4: '🕹️', 5: '⚡',
  6: '🥽', 7: '📡', 8: '🎯', 9: '🏎️', 10: '✈️',
};

const STEPS = [
  { num: 1, label: 'Pick Date', icon: Calendar },
  { num: 2, label: 'Choose Station', icon: Monitor },
  { num: 3, label: 'Select Time', icon: Clock },
  { num: 4, label: 'Confirm', icon: CheckCircle },
];

export default function BookPageInner({
  serverNow,
  initialSettings,
}: {
  serverNow: string;
  initialSettings?: Record<string, string>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const initialIndiaClock = getIndiaClock(new Date(serverNow));

  const [step, setStep] = useState(1);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [bookingClock, setBookingClock]         = useState(initialIndiaClock);
  const [selectedDate, setSelectedDate]         = useState(initialIndiaClock.date);
  const [selectedStation, setSelectedStation]   = useState<Station | null>(null);
  const [selectedTime, setSelectedTime]         = useState('');
  const [selectedDuration, setSelectedDuration] = useState<number>(1);
  const [extraControllers, setExtraControllers] = useState(0);
  const [controllerPrice, setControllerPrice]   = useState(
    initialSettings ? parseFloat(initialSettings.controller_price ?? '0') : 0
  );
  const [settingsMap, setSettingsMap]           = useState<Record<string, string>>(initialSettings ?? {});
  const [notes, setNotes]                       = useState('');

  const [benefitMode, setBenefitMode]           = useState<BookingBenefitMode>('STANDARD');
  const [activePasses, setActivePasses]         = useState<Array<{
    id: string; passType: string; totalHours: number; usedHours: number;
    status: string; purchasedAt: string; expiresAt: string;
  }>>([]);

  const controllerSectionRef = useRef<HTMLDivElement>(null);

  // Advance the booking UI from the server-rendered instant with a monotonic
  // browser timer. Device date, time, and timezone changes cannot alter it.
  useEffect(() => {
    const serverEpochMs = Date.parse(serverNow);
    if (!Number.isFinite(serverEpochMs)) return;

    const monotonicAnchorMs = performance.now();
    const tick = () => {
      const elapsedMs = Math.max(0, performance.now() - monotonicAnchorMs);
      const nextClock = getIndiaClock(new Date(serverEpochMs + elapsedMs));
      setBookingClock((current) => (
        current.date === nextClock.date
        && current.time === nextClock.time
          ? current
          : nextClock
      ));
    };

    tick();
    const timer = window.setInterval(tick, 15_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [serverNow]);

  useEffect(() => {
    if (selectedDate >= bookingClock.date) return;
    setSelectedDate(bookingClock.date);
    setSelectedTime('');
  }, [bookingClock.date, selectedDate]);

  // Load stations
  useEffect(() => {
    setStationsLoading(true);
    fetch('/api/stations')
      .then((r) => r.json())
      .then((d) => setStations((d.stations ?? []).filter((s: { isActive: boolean }) => s.isActive)))
      .finally(() => setStationsLoading(false));
  }, []);

  // Load controller price from settings
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        setSettingsMap(d);
        setControllerPrice(parseFloat(d.controller_price ?? '0'));
      });
  }, []);

  // Fetch active pass when session is available
  useEffect(() => {
    if (session?.user) {
      fetch('/api/user/pass')
        .then((r) => (r.ok ? r.json() : { passes: [] }))
        .then((d) => setActivePasses(d.passes ?? []))
        .catch(() => setActivePasses([]));
    }
  }, [session]);

  // Pre-select station from URL param after stations load
  useEffect(() => {
    const stationId = searchParams.get('station');
    if (stationId && stations.length > 0) {
      const found = stations.find((st) => st.id === stationId);
      if (found) {
        setSelectedStation(found);
        setStep(3);
      }
    }
  }, [searchParams, stations]);

  // Load booked slots when station or date changes
  const loadSlots = useCallback(async () => {
    if (!selectedStation || !selectedDate) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/slots?stationId=${selectedStation.id}&date=${selectedDate}`
      );
      const data = await res.json();
      setBookedSlots(data.bookings ?? []);
    } finally {
      setLoading(false);
    }
  }, [selectedStation, selectedDate]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [step]);

  const controllerCharge = extraControllers * controllerPrice * selectedDuration;
  const sessionCost = selectedStation ? selectedStation.hourlyRate * selectedDuration : 0;
  const normalPrice = sessionCost + controllerCharge;
  const usesHourPass = benefitMode === 'HOUR_PASS';
  const usesGuildMembership = benefitMode === 'GUILD';
  const guildMembershipPrice = getGuildMembershipDiscountedTotal(normalPrice);
  const totalPrice = usesHourPass
    ? controllerCharge
    : usesGuildMembership
      ? guildMembershipPrice
      : normalPrice;
  const stationPassAllowed = selectedStation != null;
  const hourPasses = activePasses.filter((pass) => !isGuildMembershipType(pass.passType));
  const compatiblePass = selectedStation
    ? hourPasses.find((pass) =>
        selectedStation.hasControllers
          ? ['BRONZE', 'SILVER', 'GOLD'].includes(pass.passType)
          : ['BLACK', 'APEX'].includes(pass.passType)
      ) ?? null
    : null;
  const passDateAllowed = isPassDateEligible(selectedDate);
  const activeMembership = selectPreferredGuildMembership(activePasses);
  const membershipEligibility = getGuildMembershipEligibility({
    membership: activeMembership,
    bookingDate: selectedDate,
    hasControllers: selectedStation?.hasControllers ?? false,
    extraControllers,
  });
  const compatiblePassRemaining = compatiblePass
    ? compatiblePass.totalHours - compatiblePass.usedHours
    : 0;
  const canUseHourPass = Boolean(
    compatiblePass
    && compatiblePassRemaining >= selectedDuration
    && stationPassAllowed
    && passDateAllowed,
  );

  useEffect(() => {
    if (benefitMode === 'HOUR_PASS' && !canUseHourPass) setBenefitMode('STANDARD');
    if (benefitMode === 'GUILD' && !membershipEligibility.eligible) setBenefitMode('STANDARD');
  }, [benefitMode, canUseHourPass, membershipEligibility.eligible]);

  const handleSubmit = async () => {
    if (!session) {
      router.push('/login');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId:       selectedStation!.id,
          date:            selectedDate,
          startTime:       selectedTime,
          duration:        selectedDuration,
          extraControllers,
          notes,
          benefitMode,
          hourPassId: usesHourPass ? compatiblePass?.id ?? null : null,
          appliedBenefitType: usesGuildMembership ? activeMembership?.passType ?? null : null,
          usePass: usesHourPass,
          passId: usesHourPass ? compatiblePass?.id ?? null : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Booking failed. Please try again.');
        setSubmitting(false);
        return;
      }
      router.push(`/book/confirm?id=${data.booking.id}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    if (step === 1) return !!selectedDate;
    if (step === 2) return !!selectedStation;
    if (step === 3) return !!selectedTime;
    return true;
  };

  const selectStation = (station: Station) => {
    setSelectedStation(station);
    setSelectedDuration(station.minDuration ?? 1);
    setSelectedTime('');
    setExtraControllers(0);
    setTimeout(
      () => controllerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      50,
    );
  };

  const today = bookingClock.date;
  const maxDateStr = addIndiaCalendarDays(today, 30) ?? today;
  const specialOpening = getActiveSpecialOpening(settingsMap, today);
  const specialOpeningNotice = getSpecialOpeningNotice(
    specialOpening,
    bookingClock.minutes,
  );

  return (
    <div className="page-wrapper">
      <div className="container-sm">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}>
          <ArrowLeft size={16} />
          Back to Home
        </Link>

        {/* Header */}
        <div style={{ marginBottom: 'var(--space-2xl)' }}>
          <h1 className="page-title">
            <span className="text-gradient">Book</span> Your Session
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>
            Reserve your gaming station in a few easy steps
          </p>
        </div>

        {specialOpeningNotice && (
          <div className={`special-opening-banner ${specialOpeningNotice.state}`}>
            <Clock size={18} />
            <div>
              <strong>{specialOpeningNotice.title}</strong>
              <span>{specialOpeningNotice.detail}</span>
            </div>
          </div>
        )}

        {/* Step Indicators */}
        <div className="booking-steps" style={{ marginBottom: 'var(--space-2xl)' }}>
          {STEPS.map((s, i) => (
            <Fragment key={s.num}>
              <div
                className={`booking-step ${step === s.num ? 'active' : step > s.num ? 'done' : ''}`}
              >
                <div className="booking-step-num">
                  {step > s.num ? <CheckCircle size={16} /> : s.num}
                </div>
                <div className="booking-step-label">{s.label}</div>
              </div>
              {i < STEPS.length - 1 && (
                <div className="booking-step-connector" />
              )}
            </Fragment>
          ))}
        </div>

        {/* ── STEP 1: Date ── */}
        {step === 1 && (
          <div className="card animate-fade-in-up">
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 'var(--space-xl)' }}>
              <Calendar
                size={20}
                style={{ display: 'inline', marginRight: 8, color: 'var(--color-accent-primary)' }}
              />
              Choose a Date
            </h2>

            <div className="form-group">
              <label className="form-label" htmlFor="booking-date">Select Date</label>
              <input
                id="booking-date"
                type="date"
                className="form-input"
                value={selectedDate}
                min={today}
                max={maxDateStr}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ fontSize: '1rem', padding: '16px' }}
              />
            </div>

            {selectedDate && (
              <div className="alert alert-info" style={{ marginTop: 'var(--space-md)' }}>
                <Calendar size={16} />
                Selected: <strong>{formatDate(selectedDate)}</strong>
              </div>
            )}

            {/* Quick date buttons */}
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-sm)',
                flexWrap: 'wrap',
                marginTop: 'var(--space-lg)',
              }}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
                const dateStr = addIndiaCalendarDays(today, offset) ?? today;
                const label =
                  offset === 0
                    ? 'Today'
                    : offset === 1
                    ? 'Tomorrow'
                    : new Date(`${dateStr}T00:00:00+05:30`).toLocaleDateString('en-IN', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        timeZone: 'Asia/Kolkata',
                      });
                return (
                  <button
                    key={dateStr}
                    className={`btn ${selectedDate === dateStr ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                    onClick={() => setSelectedDate(dateStr)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── STEP 2: Station ── */}
        {step === 2 && (
          <div className="animate-fade-in-up">
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                <Monitor
                  size={20}
                  style={{ display: 'inline', marginRight: 8, color: 'var(--color-accent-primary)' }}
                />
                Choose a Station
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginTop: 6 }}>
                Booking for <strong>{formatDate(selectedDate)}</strong>
              </p>
            </div>

            <div className="stations-grid booking-station-grid">
              {stationsLoading
                ? /* ── Skeleton placeholder cards ── */
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="station-skeleton-card">
                      <div className="skeleton station-skeleton-icon" />
                      <div className="station-skeleton-details">
                        <div className="skeleton" style={{ height: 13, width: '70%' }} />
                        <div className="skeleton" style={{ height: 10, width: '45%' }} />
                      </div>
                      <div className="station-skeleton-rate">
                        <div className="skeleton" style={{ height: 13, width: 44 }} />
                        <div className="skeleton" style={{ height: 9,  width: 32 }} />
                      </div>
                    </div>
                  ))
                : stations.map((station) => (
                <button
                  type="button"
                  key={station.id}
                  className={`station-card booking-station-option ${selectedStation?.id === station.id ? 'selected' : ''}`}
                  onClick={() => selectStation(station)}
                  aria-pressed={selectedStation?.id === station.id}
                >
                  <span className="booking-station-icon" aria-hidden="true">
                    {STATION_ICONS[station.position] || '🖥️'}
                  </span>

                  <span className="booking-station-details">
                    <span className="booking-station-heading">
                      <span className="station-name">{station.name}</span>
                      {selectedStation?.id === station.id && (
                        <CheckCircle
                          className="booking-station-check"
                          size={17}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className={`booking-station-type ${station.hasControllers ? '' : 'racing'}`}>
                      <Gamepad2 size={12} aria-hidden="true" />
                      {station.hasControllers ? 'PlayStation' : 'Racing simulator'}
                    </span>
                  </span>

                  <span className="booking-station-rate">
                    <strong>{formatCurrency(station.hourlyRate)}</strong>
                    <span>per hour</span>
                  </span>
                </button>
              ))}
            </div>

            {/* ── Controller Selector (appears after station is picked, only if station supports controllers) ── */}
            {selectedStation && selectedStation.hasControllers && (
              <div className="controller-selector" ref={controllerSectionRef}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Gamepad2 size={18} style={{ color: 'var(--color-accent-primary)' }} />
                      Controllers
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                      1 controller included free · Add up to 3 more
                    </p>
                  </div>
                  {controllerPrice > 0 && (
                    <span className="controller-price-badge">
                      +{formatCurrency(controllerPrice)} / hr / extra
                    </span>
                  )}
                </div>

                {/* Visual slot row */}
                <div className="controller-slots">
                  {/* Slot 0: Always included free */}
                  <div className="controller-slot included" title="Included free">
                    <span className="controller-icon">🎮</span>
                    <span>Free</span>
                  </div>

                  {/* Divider */}
                  <div className="controller-divider" />

                  {/* Slots 1–3: Extra (clickable) */}
                  {[1, 2, 3].map((n) => {
                    const isSelected = extraControllers >= n;
                    return (
                      <div
                        key={n}
                        className={`controller-slot ${isSelected ? 'extra' : 'empty'}`}
                        title={isSelected ? `Click to remove extra controller ${n}` : `Add extra controller ${n} — ${formatCurrency(controllerPrice)}`}
                        onClick={() => setExtraControllers(isSelected && extraControllers === n ? n - 1 : n)}
                        role="button"
                        aria-label={`Extra controller ${n}`}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && setExtraControllers(isSelected && extraControllers === n ? n - 1 : n)}
                      >
                        <span className="controller-icon">{isSelected ? '🎮' : '➕'}</span>
                        <span>{isSelected ? `+${n}` : `Slot ${n}`}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Summary row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-sm)', paddingTop: 'var(--space-sm)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    {extraControllers === 0
                      ? '1 controller (included)'
                      : `${1 + extraControllers} controllers total · 1 free + ${extraControllers} extra`
                    }
                  </div>
                  {extraControllers > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        onClick={() => setExtraControllers(0)}
                        title="Remove all extra controllers"
                      >
                        <Minus size={12} /> Remove all
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Time ── */}
        {step === 3 && (
          <div className="card animate-fade-in-up">
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 4 }}>
              <Clock
                size={20}
                style={{ display: 'inline', marginRight: 8, color: 'var(--color-accent-primary)' }}
              />
              Select Time Slot
            </h2>
            <p
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: '0.875rem',
                marginBottom: 'var(--space-xl)',
              }}
            >
              {selectedStation?.name} · {formatDate(selectedDate)}
            </p>

            {/* Duration selector */}
            <div className="form-group" style={{ marginBottom: 'var(--space-xl)' }}>
              <label className="form-label">Session Duration</label>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                {getDurationOptions(selectedStation?.minDuration ?? 1).map((opt) => (
                  <button
                    key={opt.value}
                    className={`btn ${
                      selectedDuration === opt.value ? 'btn-primary' : 'btn-ghost'
                    } btn-sm`}
                    onClick={() => {
                      setSelectedDuration(opt.value);
                      setSelectedTime('');
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: 'var(--space-2xl)',
                  color: 'var(--color-text-muted)',
                }}
              >
                Loading availability...
              </div>
            ) : (
              <>
                <div className="form-label" style={{ marginBottom: 'var(--space-sm)' }}>
                  Available Start Times
                </div>
                <div className="time-slots-grid">
                  {getTimeSlotsForDate(selectedDate, 30, specialOpening).map((time) => {
                    const [slotH, slotM] = time.split(':').map(Number);
                    const slotStartMinsVal = slotH * 60 + slotM;
                    const slotEndMinsVal = slotStartMinsVal + Math.round(selectedDuration * 60);
                    // Hide slots where booking would run past closing time (11 PM = 1380 mins)
                    if (slotEndMinsVal > CLOSING_HOUR * 60) return null;

                    // Block past slots — allow up to 15 min after slot start
                    const isPast = (
                      selectedDate < bookingClock.date
                      || (
                        selectedDate === bookingClock.date
                        && slotStartMinsVal + 15 <= bookingClock.minutes
                      )
                    );

                    // Detect frozen (BLOCKED) vs normal booked overlap
                    const isFrozen = bookedSlots.some((b) => {
                      if (b.status !== 'BLOCKED') return false;
                      const [bSH, bSM] = b.startTime.split(':').map(Number);
                      const [bEH, bEM] = b.endTime.split(':').map(Number);
                      const bStartM = bSH * 60 + bSM;
                      const bEndM = bEH * 60 + bEM;
                      return slotStartMinsVal < bEndM && slotEndMinsVal > bStartM;
                    });
                    const booked = !isFrozen && !isSlotAvailable(time, selectedDuration, bookedSlots);
                    const unavailable = isPast || isFrozen || booked;

                    // Determine slot state class
                    const slotClass = isPast    ? 'slot-past'
                                    : isFrozen  ? 'slot-frozen'
                                    : booked    ? 'slot-booked'
                                    : selectedTime === time ? 'selected'
                                    : '';

                    return (
                      <button
                        key={time}
                        className={`time-slot ${slotClass}`}
                        onClick={() => !unavailable && setSelectedTime(time)}
                        disabled={unavailable}
                        title={
                          isPast    ? 'This time has already passed'
                          : isFrozen  ? 'Reserved for walk-in customer'
                          : booked    ? 'Already booked'
                          : `Book from ${formatTime(time)}`
                        }
                      >
                        {isFrozen
                          ? <><Snowflake size={11} style={{ display: 'inline', marginRight: 2 }} />{formatTime(time)}</>
                          : formatTime(time)
                        }
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-lg)', marginTop: 'var(--space-lg)', fontSize: '0.8rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                  {/* Available */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', borderRadius: 2 }} />
                    Available
                  </span>
                  {/* Selected */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, background: 'var(--gradient-primary)', borderRadius: 2, boxShadow: '0 2px 6px rgba(108,99,255,0.45)' }} />
                    Selected
                  </span>
                  {/* Past */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.5 }}>
                    <span style={{ width: 12, height: 12, background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 2 }} />
                    <span style={{ textDecoration: 'line-through' }}>Past</span>
                  </span>
                  {/* Booked */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 2 }} />
                    <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>Booked</span>
                  </span>
                </div>

              </>
            )}

            {selectedTime && (
              <>
                {hourPasses.length > 0 && !compatiblePass && (
                  <div className="alert alert-info" style={{ marginTop: 'var(--space-lg)' }}>
                    <Award size={16} />
                    {selectedStation?.hasControllers
                      ? 'This station uses Bronze, Silver, or Gold passes.'
                      : 'This station uses Black or Apex simulator passes.'}
                  </div>
                )}

                {(activeMembership || compatiblePass) && (() => {
                  const PASS_COLOR: Record<string, string> = {
                    BRONZE: '#cd7f32',
                    SILVER: '#c0c0c0',
                    GOLD: '#FFD700',
                    BLACK: '#d8dee9',
                    APEX: '#67e8f9',
                  };
                  const PASS_BG: Record<string, string> = {
                    BRONZE: '205,127,50',
                    SILVER: '192,192,192',
                    GOLD: '255,215,0',
                    BLACK: '216,222,233',
                    APEX: '103,232,249',
                  };
                  const passColor = compatiblePass ? PASS_COLOR[compatiblePass.passType] ?? '#FFD700' : '#FFD700';
                  const membershipColor = activeMembership?.passType === 'GUILD_MASTER' ? '#f4cf58' : '#93c5fd';
                  return (
                    <div style={{ marginTop: 'var(--space-lg)' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        Booking Benefit
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {activeMembership && (
                          <button
                            type="button"
                            aria-pressed={usesGuildMembership}
                            onClick={() => membershipEligibility.eligible && setBenefitMode('GUILD')}
                            disabled={!membershipEligibility.eligible}
                            style={{
                              minHeight: 64, display: 'flex', alignItems: 'center', gap: 12,
                              padding: '12px 14px', borderRadius: 'var(--radius-md)', textAlign: 'left',
                              border: `2px solid ${usesGuildMembership ? membershipColor : membershipEligibility.eligible ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
                              background: usesGuildMembership ? 'rgba(244,207,88,0.07)' : 'var(--color-bg-card)',
                              color: 'inherit', cursor: membershipEligibility.eligible ? 'pointer' : 'not-allowed',
                              opacity: membershipEligibility.eligible ? 1 : 0.58,
                              transition: 'border-color 0.15s, background 0.15s',
                            }}
                          >
                            <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${membershipColor}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                              {usesGuildMembership && <span style={{ width: 8, height: 8, borderRadius: '50%', background: membershipColor }} />}
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: usesGuildMembership ? membershipColor : 'var(--color-text-primary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <Award size={14} /> Apply {guildMembershipName(activeMembership.passType)}
                                </span>
                                {membershipEligibility.eligible && <strong style={{ color: '#4ade80', fontSize: '0.76rem' }}>{GUILD_MEMBERSHIP_DISCOUNT_PERCENTAGE}% OFF</strong>}
                              </span>
                              <span style={{ display: 'block', fontSize: '0.76rem', color: membershipEligibility.eligible ? 'var(--color-text-muted)' : '#f59e0b', marginTop: 3, lineHeight: 1.4 }}>
                                {membershipEligibility.eligible
                                  ? `Save ${formatCurrency(normalPrice - guildMembershipPrice)}. Valid until ${new Date(activeMembership.expiresAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}.`
                                  : membershipEligibility.reason}
                              </span>
                            </span>
                          </button>
                        )}

                        {compatiblePass && (
                          <button
                            type="button"
                            aria-pressed={usesHourPass}
                            onClick={() => canUseHourPass && setBenefitMode('HOUR_PASS')}
                            disabled={!canUseHourPass}
                            style={{
                              minHeight: 64, display: 'flex', alignItems: 'center', gap: 12,
                              padding: '12px 14px', borderRadius: 'var(--radius-md)', textAlign: 'left',
                              border: `2px solid ${usesHourPass ? passColor : canUseHourPass ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
                              background: usesHourPass ? `rgba(${PASS_BG[compatiblePass.passType] ?? '255,215,0'},0.08)` : 'var(--color-bg-card)',
                              color: 'inherit', cursor: canUseHourPass ? 'pointer' : 'not-allowed',
                              opacity: canUseHourPass ? 1 : 0.58,
                              transition: 'border-color 0.15s, background 0.15s',
                            }}
                          >
                            <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${passColor}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                              {usesHourPass && <span style={{ width: 8, height: 8, borderRadius: '50%', background: passColor }} />}
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: usesHourPass ? passColor : 'var(--color-text-primary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <Award size={14} /> Use {compatiblePass.passType.charAt(0) + compatiblePass.passType.slice(1).toLowerCase()} Pass
                                </span>
                                {canUseHourPass && <strong style={{ color: '#4ade80', fontSize: '0.76rem' }}>SESSION COVERED</strong>}
                              </span>
                              <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                                {!passDateAllowed
                                  ? 'Passes are available Monday through Friday only.'
                                  : canUseHourPass
                                    ? `${compatiblePassRemaining} hrs remaining - ${compatiblePassRemaining - selectedDuration} after this session`
                                    : `Only ${compatiblePassRemaining} hr(s) left - need ${selectedDuration} hr(s)`}
                              </span>
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          aria-pressed={benefitMode === 'STANDARD'}
                          onClick={() => setBenefitMode('STANDARD')}
                          style={{
                            minHeight: 64, display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 14px', borderRadius: 'var(--radius-md)', textAlign: 'left',
                            border: `2px solid ${benefitMode === 'STANDARD' ? 'var(--color-accent-primary)' : 'rgba(255,255,255,0.12)'}`,
                            background: benefitMode === 'STANDARD' ? 'rgba(108,99,255,0.08)' : 'var(--color-bg-card)',
                            color: 'inherit', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                          }}
                        >
                          <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--color-accent-primary)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            {benefitMode === 'STANDARD' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent-primary)' }} />}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 700, fontSize: '0.875rem', color: benefitMode === 'STANDARD' ? 'var(--color-accent-primary)' : 'var(--color-text-primary)' }}>Pay Normally</span>
                            <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 3 }}>Pay the regular amount when you arrive.</span>
                          </span>
                          <strong style={{ flexShrink: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>{formatCurrency(normalPrice)}</strong>
                        </button>
                      </div>
                    </div>
                  );
                })()}

                <div
                  className="alert alert-success"
                  style={{ marginTop: 'var(--space-lg)', flexWrap: 'wrap', gap: 4 }}
                >
                  <CheckCircle size={16} style={{ flexShrink: 0 }} />
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    <span>Selected:</span>
                    <strong>{formatTime(selectedTime)}</strong>
                    <span>—</span>
                    <strong>{formatTime(addHours(selectedTime, selectedDuration))}</strong>
                    <span>·</span>
                    <span>
                      {usesHourPass
                        ? <><strong style={{ color: '#4ade80' }}>Pass Booking</strong>{controllerCharge > 0 ? ` + ${formatCurrency(controllerCharge)} controllers` : ''}</>
                        : usesGuildMembership
                          ? <><strong style={{ color: '#4ade80' }}>{guildMembershipName(activeMembership?.passType ?? '')} applied</strong> · Total: <strong>{formatCurrency(totalPrice)}</strong></>
                          : <>Total: <strong>{formatCurrency(totalPrice)}</strong></>
                      }
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 4: Confirm ── */}
        {step === 4 && (
          <div className="card animate-fade-in-up">
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 'var(--space-xl)' }}>
              <CheckCircle
                size={20}
                style={{ display: 'inline', marginRight: 8, color: 'var(--color-accent-primary)' }}
              />
              Confirm Your Booking
            </h2>

            <div className="booking-details-grid">
              <div className="booking-detail-item">
                <div className="booking-detail-label">Station</div>
                <div className="booking-detail-value">{selectedStation?.name}</div>
              </div>
              <div className="booking-detail-item">
                <div className="booking-detail-label">Date</div>
                <div className="booking-detail-value">{formatDate(selectedDate)}</div>
              </div>
              <div className="booking-detail-item">
                <div className="booking-detail-label">Start Time</div>
                <div className="booking-detail-value">{formatTime(selectedTime)}</div>
              </div>
              <div className="booking-detail-item">
                <div className="booking-detail-label">End Time</div>
                <div className="booking-detail-value">
                  {formatTime(addHours(selectedTime, selectedDuration))}
                </div>
              </div>
              <div className="booking-detail-item">
                <div className="booking-detail-label">Duration</div>
                <div className="booking-detail-value">
                  {selectedDuration === 0.5 ? '30 min' : `${selectedDuration} Hour${selectedDuration > 1 ? 's' : ''}`}
                </div>
              </div>

              {/* Controllers — only shown for stations that support them */}
              {selectedStation?.hasControllers && (
                <div className="booking-detail-item">
                  <div className="booking-detail-label">🎮 Controllers</div>
                  <div className="booking-detail-value" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>1 × Free (included)</span>
                    {extraControllers > 0 && (
                      <span style={{ color: 'var(--color-accent-primary)', fontSize: '0.85rem' }}>
                        + {extraControllers} extra = {formatCurrency(controllerCharge)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Pricing breakdown */}
              <div className="booking-detail-item" style={{ background: usesHourPass ? 'rgba(0,230,118,0.04)' : 'rgba(255,255,255,0.02)', borderColor: usesHourPass ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.06)' }}>
                <div className="booking-detail-label">Session Cost</div>
                <div className="booking-detail-value" style={{ fontSize: '0.95rem' }}>
                  {usesHourPass ? (
                    <span>
                      <s style={{ opacity: 0.4, marginRight: 8 }}>{formatCurrency(selectedStation!.hourlyRate)} × {selectedDuration}h = {formatCurrency(sessionCost)}</s>
                      <span style={{ color: 'var(--color-accent-success)', fontWeight: 700 }}>₹0 (Pass)</span>
                    </span>
                  ) : (
                    <>{formatCurrency(selectedStation!.hourlyRate)} × {selectedDuration}h = {formatCurrency(sessionCost)}</>
                  )}
                </div>
              </div>
              {selectedStation?.hasControllers && extraControllers > 0 && (
                <div className="booking-detail-item" style={{ background: 'rgba(108,99,255,0.04)', borderColor: 'rgba(108,99,255,0.12)' }}>
                  <div className="booking-detail-label">Controller Add-on</div>
                  <div className="booking-detail-value" style={{ fontSize: '0.95rem', color: 'var(--color-accent-primary)' }}>
                    {extraControllers} × {formatCurrency(controllerPrice)}/hr × {selectedDuration}h = +{formatCurrency(controllerCharge)}
                  </div>
                </div>
              )}

              {usesGuildMembership && activeMembership && (
                <div className="booking-detail-item" style={{ gridColumn: '1 / -1', background: 'rgba(74,222,128,0.05)', borderColor: 'rgba(74,222,128,0.22)' }}>
                  <div className="booking-detail-label">Guild Membership</div>
                  <div className="booking-detail-value" style={{ color: '#4ade80' }}>
                    {guildMembershipName(activeMembership.passType)} · {GUILD_MEMBERSHIP_DISCOUNT_PERCENTAGE}% OFF entire booking
                  </div>
                </div>
              )}

              {/* Total */}
              <div
                className="booking-detail-item"
                style={{
                  background: usesHourPass || usesGuildMembership ? 'rgba(0,230,118,0.08)' : 'rgba(108,99,255,0.08)',
                  borderColor: usesHourPass || usesGuildMembership ? 'rgba(0,230,118,0.25)' : 'rgba(108,99,255,0.25)',
                }}
              >
                <div className="booking-detail-label">Total Price</div>
                <div
                  className="booking-detail-value"
                  style={{ color: usesHourPass || usesGuildMembership ? 'var(--color-accent-success)' : 'var(--color-accent-primary)', fontSize: '1.2rem' }}
                >
                  {usesGuildMembership && <s style={{ marginRight: 8, color: 'var(--color-text-muted)', fontSize: '0.88rem', fontWeight: 400 }}>{formatCurrency(normalPrice)}</s>}
                  {formatCurrency(totalPrice)}
                  {(usesHourPass || usesGuildMembership) && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: 8, color: 'var(--color-accent-success)' }}>
                      ({usesHourPass ? 'Pass' : guildMembershipName(activeMembership?.passType ?? '')} applied)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Game request */}
            <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
              <label className="form-label" htmlFor="booking-notes">
                Game Request <span className="form-optional">(optional)</span>
              </label>
              <p className="form-helper">
                Tell us which game to prepare. We will do our best to have it
                ready, subject to availability and update time.
              </p>
              <textarea
                id="booking-notes"
                className="form-input"
                placeholder="e.g. EA Sports FC 26, Tekken 8, GTA V"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={CUSTOMER_GAME_REQUEST_MAX_LENGTH}
                rows={2}
                style={{ resize: 'vertical' }}
              />
            </div>

            {!session && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>
                  You need to{' '}
                  <Link
                    href="/login"
                    style={{ color: 'var(--color-accent-secondary)', fontWeight: 700 }}
                  >
                    sign in
                  </Link>{' '}
                  to complete your booking.
                </span>
              </div>
            )}

            {error && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)' }}>
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              id="confirm-booking-btn"
              className="btn btn-primary"
              style={{ width: '100%', padding: '16px', fontSize: '1rem' }}
              onClick={handleSubmit}
              disabled={submitting || !session}
            >
              {submitting ? (
                'Processing...'
              ) : (
                <>
                  <CheckCircle size={20} />
                  Confirm Booking
                </>
              )}
            </button>

            <p
              style={{
                textAlign: 'center',
                fontSize: '0.8rem',
                color: 'var(--color-text-muted)',
                marginTop: 'var(--space-md)',
              }}
            >
              Payment collected at the cafe. No online payment required.
            </p>
          </div>
        )}

        {/* Navigation buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 'var(--space-xl)',
            gap: 'var(--space-md)',
          }}
        >
          {step > 1 ? (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setStep(step - 1);
                setError('');
              }}
              id="book-prev-btn"
            >
              <ChevronLeft size={18} />
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 && (
            <button
              className="btn btn-primary"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              id="book-next-btn"
            >
              Continue
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
