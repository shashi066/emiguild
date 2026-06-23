'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  Calendar, Monitor, Clock, CheckCircle, ChevronRight,
  ChevronLeft, AlertCircle, Zap, Snowflake, Gamepad2, Plus, Minus, Award,
} from 'lucide-react';
import {
  TIME_SLOTS, DURATION_OPTIONS, CLOSING_HOUR, formatTime, formatDate,
  formatCurrency, getTodayString, toLocalDateString, isSlotAvailable, addHours, getTimeSlotsForDate,
  getDurationOptions,
} from '@/lib/utils';

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

export default function BookPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [step, setStep] = useState(1);
  const [stations, setStations] = useState<Station[]>([]);
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [selectedDate, setSelectedDate]         = useState(getTodayString());
  const [selectedStation, setSelectedStation]   = useState<Station | null>(null);
  const [selectedTime, setSelectedTime]         = useState('');
  const [selectedDuration, setSelectedDuration] = useState<number>(1);
  const [extraControllers, setExtraControllers] = useState(0);
  const [controllerPrice, setControllerPrice]   = useState(0);
  const [notes, setNotes]                       = useState('');
  const [usePass, setUsePass]                   = useState(false);
  const [activePass, setActivePass]             = useState<{
    id: string; passType: string; totalHours: number; usedHours: number; expiresAt: string;
  } | null>(null);

  const controllerSectionRef = useRef<HTMLDivElement>(null);
  // Load stations
  useEffect(() => {
    fetch('/api/stations')
      .then((r) => r.json())
      .then((d) => setStations(d.stations ?? []));
  }, []);

  // Load controller price from settings
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setControllerPrice(parseFloat(d.controller_price ?? '0')));
  }, []);

  // Fetch active pass when session is available
  useEffect(() => {
    if (session?.user) {
      fetch('/api/user/pass')
        .then((r) => (r.ok ? r.json() : { pass: null }))
        .then((d) => setActivePass(d.pass ?? null))
        .catch(() => setActivePass(null));
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

  const controllerCharge = extraControllers * controllerPrice * selectedDuration;
  const sessionCost = selectedStation ? selectedStation.hourlyRate * selectedDuration : 0;
  const totalPrice = (usePass ? 0 : sessionCost) + controllerCharge;

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
          usePass,
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

  const today = getTodayString();
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 30);
  const maxDateStr = toLocalDateString(maxDate);

  return (
    <div className="page-wrapper">
      <div className="container-sm">
        {/* Header */}
        <div style={{ marginBottom: 'var(--space-2xl)' }}>
          <h1 className="page-title">
            <span className="text-gradient">Book</span> Your Session
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>
            Reserve your gaming station in a few easy steps
          </p>
        </div>

        {/* Step Indicators */}
        <div className="booking-steps" style={{ marginBottom: 'var(--space-2xl)' }}>
          {STEPS.map((s, i) => (
            <>
              <div
                key={s.num}
                className={`booking-step ${step === s.num ? 'active' : step > s.num ? 'done' : ''}`}
              >
                <div className="booking-step-num">
                  {step > s.num ? <CheckCircle size={16} /> : s.num}
                </div>
                <div className="booking-step-label">{s.label}</div>
              </div>
              {i < STEPS.length - 1 && (
                <div key={`conn-${i}`} className="booking-step-connector" />
              )}
            </>
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
                const d = new Date();
                d.setDate(d.getDate() + offset);
                const dateStr = toLocalDateString(d);
                const label =
                  offset === 0
                    ? 'Today'
                    : offset === 1
                    ? 'Tomorrow'
                    : d.toLocaleDateString('en-IN', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
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

            <div className="stations-grid">
              {stations.map((station) => (
                <div
                  key={station.id}
                  className={`station-card ${selectedStation?.id === station.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedStation(station);
                    setSelectedDuration(station.minDuration ?? 1);
                    setSelectedTime('');
                    setExtraControllers(0);
                    setTimeout(() => controllerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSelectedStation(station);
                      setSelectedDuration(station.minDuration ?? 1);
                      setSelectedTime('');
                      setExtraControllers(0);
                      setTimeout(() => controllerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                    }
                  }}
                >
                  <div className="station-image">
                    {STATION_ICONS[station.position] || '🖥️'}
                  </div>
                  <div className="station-body">
                    <div className="station-name">{station.name}</div>
                    <div className="station-description">{station.description}</div>
                    <div className="station-specs">{station.specs}</div>
                    <div className="station-footer">
                      <div>
                        <div className="station-price">{formatCurrency(station.hourlyRate)}</div>
                        <div className="station-price-label">per hour</div>
                      </div>
                      {selectedStation?.id === station.id && (
                        <div style={{ color: 'var(--color-accent-success)' }}>
                          <CheckCircle size={22} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
                  {getTimeSlotsForDate(selectedDate, selectedStation?.minDuration === 0.5 ? 30 : 60).map((time) => {
                    const [slotH, slotM] = time.split(':').map(Number);
                    const slotStartMinsVal = slotH * 60 + slotM;
                    const slotEndMinsVal = slotStartMinsVal + Math.round(selectedDuration * 60);
                    // Hide slots where booking would run past closing time (11 PM = 1380 mins)
                    if (slotEndMinsVal > CLOSING_HOUR * 60) return null;

                    // Block past slots — allow up to 15 min after slot start
                    const now = new Date();
                    const isToday = selectedDate === getTodayString();
                    const nowMins = now.getHours() * 60 + now.getMinutes();
                    const isPast = isToday && nowMins > slotStartMinsVal + 15;

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
                {/* Pass payment toggle */}
                {activePass && (() => {
                  const remaining = activePass.totalHours - activePass.usedHours;
                  const canUse = remaining >= selectedDuration;
                  const PASS_COLOR: Record<string, string> = { BRONZE: '#cd7f32', SILVER: '#c0c0c0', GOLD: '#FFD700' };
                  const color = PASS_COLOR[activePass.passType] ?? '#FFD700';
                  return (
                    <div style={{ marginTop: 'var(--space-lg)' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        Payment Method
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* Pass option */}
                        <button
                          onClick={() => canUse && setUsePass(true)}
                          disabled={!canUse}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '14px 16px', borderRadius: 'var(--radius-md)', textAlign: 'left',
                            border: `2px solid ${usePass ? color : canUse ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
                            background: usePass ? `rgba(${activePass.passType === 'BRONZE' ? '205,127,50' : activePass.passType === 'SILVER' ? '192,192,192' : '255,215,0'},0.08)` : 'var(--color-bg-card)',
                            cursor: canUse ? 'pointer' : 'not-allowed',
                            opacity: canUse ? 1 : 0.5,
                            transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {usePass && <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: usePass ? color : 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Award size={14} />
                              Use {activePass.passType.charAt(0) + activePass.passType.slice(1).toLowerCase()} Pass
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                              {canUse
                                ? `${remaining} hrs remaining → ${remaining - selectedDuration} after this session`
                                : `Only ${remaining} hr(s) left — need ${selectedDuration} hr(s)`}
                            </div>
                          </div>
                          {canUse && <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4ade80' }}>FREE</div>}
                        </button>

                        {/* Pay at counter option */}
                        <button
                          onClick={() => setUsePass(false)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '14px 16px', borderRadius: 'var(--radius-md)', textAlign: 'left',
                            border: `2px solid ${!usePass ? 'var(--color-accent-primary)' : 'rgba(255,255,255,0.12)'}`,
                            background: !usePass ? 'rgba(108,99,255,0.08)' : 'var(--color-bg-card)',
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid var(--color-accent-primary)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {!usePass && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent-primary)' }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: !usePass ? 'var(--color-accent-primary)' : 'var(--color-text-primary)' }}>Pay at Counter</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>Pay when you arrive at the guild</div>
                          </div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>{formatCurrency(sessionCost + controllerCharge)}</div>
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
                      {usePass
                        ? <><strong style={{ color: '#4ade80' }}>Pass Booking</strong>{controllerCharge > 0 ? ` + ${formatCurrency(controllerCharge)} controllers` : ''}</>
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
              <div className="booking-detail-item" style={{ background: usePass ? 'rgba(0,230,118,0.04)' : 'rgba(255,255,255,0.02)', borderColor: usePass ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.06)' }}>
                <div className="booking-detail-label">Session Cost</div>
                <div className="booking-detail-value" style={{ fontSize: '0.95rem' }}>
                  {usePass ? (
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

              {/* Total */}
              <div
                className="booking-detail-item"
                style={{
                  background: usePass ? 'rgba(0,230,118,0.08)' : 'rgba(108,99,255,0.08)',
                  borderColor: usePass ? 'rgba(0,230,118,0.25)' : 'rgba(108,99,255,0.25)',
                }}
              >
                <div className="booking-detail-label">Total Price</div>
                <div
                  className="booking-detail-value"
                  style={{ color: usePass ? 'var(--color-accent-success)' : 'var(--color-accent-primary)', fontSize: '1.2rem' }}
                >
                  {formatCurrency(totalPrice)}{usePass && <span style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: 8, color: 'var(--color-accent-success)' }}>(Pass applied)</span>}
                </div>
              </div>
            </div>

            {/* Station specs */}
            <div
              style={{
                background: 'rgba(0, 212, 255, 0.05)',
                border: '1px solid rgba(0, 212, 255, 0.15)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-md)',
                marginBottom: 'var(--space-lg)',
                fontSize: '0.8rem',
                color: 'var(--color-accent-secondary)',
              }}
            >
              <Zap size={13} style={{ display: 'inline', marginRight: 4 }} />
              {selectedStation?.specs}
            </div>

            {/* Notes */}
            <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
              <label className="form-label" htmlFor="booking-notes">
                Special Requests (optional)
              </label>
              <textarea
                id="booking-notes"
                className="form-input"
                placeholder="Any special requirements or requests..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            {!session && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)' }}>
                <AlertCircle size={16} />
                You need to{' '}
                <Link
                  href="/login"
                  style={{ color: 'var(--color-accent-secondary)', fontWeight: 700 }}
                >
                  sign in
                </Link>{' '}
                to complete your booking.
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
