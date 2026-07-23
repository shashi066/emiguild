'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  BookOpen,
  Calendar,
  Clock3,
  Gem,
  Gamepad2,
  History,
  IndianRupee,
  Mail,
  Phone,
  RefreshCw,
  TicketCheck,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import { decryptPhone } from '@/lib/crypto';
import { formatCurrency, formatTime } from '@/lib/utils';

type UserStub = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: string;
};

type BookingPreview = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalPrice: number;
  status: string;
  bookingType: string;
  paymentStatus: string;
  extraControllers: number;
  controllerCharge: number;
  passHoursDeducted: number;
  station: { name: string };
  userPass: { passType: string } | null;
};

export type AdminUserDetails = {
  user: UserStub & { guildGems: number };
  summary: {
    totalBookings: number;
    totalBookedHours: number;
    amountSpent: number;
    bookingValue: number;
    pendingBookings: number;
    confirmedBookings: number;
    checkedInBookings: number;
    completedBookings: number;
    attendedBookings: number;
    cancelledBookings: number;
  };
  lastVisit: BookingPreview | null;
  nextBooking: BookingPreview | null;
  activePasses: Array<{
    id: string;
    passType: string;
    totalHours: number;
    usedHours: number;
    remainingHours: number;
    expiresAt: string;
  }>;
  recentBookings: BookingPreview[];
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked In',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function compactDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function joinedDate(date: string) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function bookingDateParts(date: string) {
  const parts = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).formatToParts(new Date(`${date}T00:00:00`));

  return {
    day: parts.find((part) => part.type === 'day')?.value ?? '',
    month: parts.find((part) => part.type === 'month')?.value ?? '',
  };
}

function durationLabel(duration: number) {
  if (duration === 0.5) return '30 min';
  return `${duration} hr${duration === 1 ? '' : 's'}`;
}

function BookingMoment({
  title,
  booking,
  empty,
}: {
  title: string;
  booking: BookingPreview | null;
  empty: string;
}) {
  return (
    <div className="user-detail-moment">
      <span className="user-detail-moment-marker"><Calendar size={14} /></span>
      <div>
        <span>{title}</span>
        {booking ? (
          <>
            <strong>{compactDate(booking.date)} · {formatTime(booking.startTime)}</strong>
            <small>{booking.station.name} · {durationLabel(booking.duration)}</small>
          </>
        ) : (
          <strong className="muted">{empty}</strong>
        )}
      </div>
    </div>
  );
}

function RecentBooking({ booking }: { booking: BookingPreview }) {
  const date = bookingDateParts(booking.date);
  const passText = booking.passHoursDeducted > 0
    ? `${booking.userPass?.passType ?? 'Guild'} Pass · ${durationLabel(booking.passHoursDeducted)} used`
    : booking.paymentStatus === 'PAID'
      ? 'Paid'
      : 'At counter';
  const controllerText = booking.extraControllers > 0
    ? ` · ${booking.extraControllers} extra controller${booking.extraControllers === 1 ? '' : 's'}`
    : '';

  return (
    <article className="user-detail-booking">
      <time className="user-detail-booking-date" dateTime={booking.date}>
        <strong>{date.day}</strong>
        <span>{date.month}</span>
      </time>
      <div className="user-detail-booking-main">
        <div className="user-detail-booking-heading">
          <strong><Gamepad2 size={14} />{booking.station.name}</strong>
          <span className={`user-detail-status ${booking.status.toLowerCase()}`}>
            {STATUS_LABELS[booking.status] ?? booking.status}
          </span>
        </div>
        <span className="user-detail-booking-time">
          {formatTime(booking.startTime)}–{formatTime(booking.endTime)}
          {' · '}
          {durationLabel(booking.duration)}
        </span>
        <small>
          {booking.bookingType === 'OFFLINE' ? 'Walk-in' : 'Online'}
          {' · '}
          {passText}
          {controllerText}
        </small>
      </div>
      <div className="user-detail-booking-price">
        <span>Total</span>
        <strong>{formatCurrency(booking.totalPrice)}</strong>
      </div>
    </article>
  );
}

export function UserDetailsModal({
  user,
  cachedDetails,
  onLoaded,
  onClose,
}: {
  user: UserStub;
  cachedDetails?: AdminUserDetails;
  onLoaded: (userId: string, details: AdminUserDetails) => void;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<AdminUserDetails | null>(cachedDetails ?? null);
  const [loading, setLoading] = useState(!cachedDetails);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ));
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (cachedDetails && retry === 0) {
      setDetails(cachedDetails);
      setLoading(false);
      setError('');
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetch(`/api/admin/users/${user.id}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load user details.');
        const nextDetails: AdminUserDetails = {
          ...data,
          user: {
            ...data.user,
            phone: decryptPhone(data.user.phone),
          },
        };
        setDetails(nextDetails);
        onLoaded(user.id, nextDetails);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load user details.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [cachedDetails, onLoaded, retry, user.id]);

  return (
    <div
      className="user-detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="user-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-detail-title"
      >
        <header className="user-detail-header">
          <div className="user-detail-avatar" aria-hidden="true">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="user-detail-identity">
            <span className="user-detail-eyebrow"><UserRound size={13} />Customer Profile</span>
            <div className="user-detail-name-row">
              <h2 id="user-detail-title">{user.name}</h2>
              <span className="user-detail-role">{user.role === 'ADMIN' ? 'Admin' : 'Customer'}</span>
            </div>
            <small>#{user.id.slice(-8).toUpperCase()}</small>
          </div>
          <div className="user-detail-header-actions">
            {details && (
              <span className="user-detail-gems">
                <Gem size={15} />
                <b>{details.user.guildGems}</b>
                <span>Guild Gems</span>
              </span>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              className="user-detail-close"
              onClick={onClose}
              aria-label="Close user details"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="user-detail-scroll">
          {loading ? (
            <div className="user-detail-state">
              <div className="spinner" />
              <strong>Loading customer details...</strong>
            </div>
          ) : error ? (
            <div className="user-detail-state error">
              <AlertCircle size={24} />
              <strong>{error}</strong>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRetry((value) => value + 1)}>
                <RefreshCw size={14} />Retry
              </button>
            </div>
          ) : details ? (
            <>
              <section className="user-detail-contact" aria-label="Customer contact details">
                <div>
                  <span><Mail size={15} /></span>
                  <p><small>Email</small><strong>{details.user.email}</strong></p>
                </div>
                <div>
                  <span><Phone size={15} /></span>
                  <p><small>Phone</small><strong>{details.user.phone || 'No phone added'}</strong></p>
                </div>
                <div>
                  <span><Calendar size={15} /></span>
                  <p><small>Member Since</small><strong>{joinedDate(details.user.createdAt)}</strong></p>
                </div>
              </section>

              <section className="user-detail-metrics" aria-label="Customer booking summary">
                <div className="bookings">
                  <span className="user-detail-metric-icon"><BookOpen size={17} /></span>
                  <p>
                    <small>Total Bookings</small>
                    <strong>{details.summary.totalBookings}</strong>
                    <span>All reservations</span>
                  </p>
                </div>
                <div className="spent">
                  <span className="user-detail-metric-icon"><IndianRupee size={17} /></span>
                  <p>
                    <small>Amount Spent</small>
                    <strong>{formatCurrency(details.summary.amountSpent)}</strong>
                    <span>Attended sessions</span>
                  </p>
                </div>
                <div className="value">
                  <span className="user-detail-metric-icon"><WalletCards size={17} /></span>
                  <p>
                    <small>Booking Value</small>
                    <strong>{formatCurrency(details.summary.bookingValue)}</strong>
                    <span>Excludes cancelled</span>
                  </p>
                </div>
                <div className="hours">
                  <span className="user-detail-metric-icon"><Clock3 size={17} /></span>
                  <p>
                    <small>Booked Hours</small>
                    <strong>{details.summary.totalBookedHours.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</strong>
                    <span>Active reservations</span>
                  </p>
                </div>
              </section>

              <div className="user-detail-layout">
                <section className="user-detail-main">
                  <div className="user-detail-section-title">
                    <div><History size={17} /><h3>Recent Bookings</h3></div>
                    <span>Latest {details.recentBookings.length}</span>
                  </div>
                  {details.recentBookings.length > 0 ? (
                    <div className="user-detail-bookings">
                      {details.recentBookings.map((booking) => (
                        <RecentBooking key={booking.id} booking={booking} />
                      ))}
                    </div>
                  ) : (
                    <p className="user-detail-empty">This user has no bookings yet.</p>
                  )}
                </section>

                <aside className="user-detail-side">
                  <section className="user-detail-side-section">
                    <div className="user-detail-section-title">
                      <div><BookOpen size={16} /><h3>Booking Status</h3></div>
                    </div>
                    <div className="user-detail-status-list">
                      <span className="pending"><i />Pending <b>{details.summary.pendingBookings}</b></span>
                      <span className="confirmed"><i />Confirmed <b>{details.summary.confirmedBookings}</b></span>
                      <span className="checked-in"><i />Checked In <b>{details.summary.checkedInBookings}</b></span>
                      <span className="completed"><i />Completed <b>{details.summary.completedBookings}</b></span>
                      <span className="cancelled"><i />Cancelled <b>{details.summary.cancelledBookings}</b></span>
                    </div>
                  </section>

                  <section className="user-detail-side-section">
                    <div className="user-detail-section-title">
                      <div><Calendar size={16} /><h3>Visits & Schedule</h3></div>
                    </div>
                    <div className="user-detail-moments">
                      <BookingMoment title="Next Booking" booking={details.nextBooking} empty="No upcoming booking" />
                      <BookingMoment title="Last Visit" booking={details.lastVisit} empty="No attended visits" />
                    </div>
                  </section>

                  <section className="user-detail-side-section">
                    <div className="user-detail-section-title">
                      <div><TicketCheck size={16} /><h3>Active Passes</h3></div>
                      <span>{details.activePasses.length}</span>
                    </div>
                    {details.activePasses.length > 0 ? (
                      <div className="user-detail-passes">
                        {details.activePasses.map((pass) => {
                          const remainingPercent = pass.totalHours > 0
                            ? Math.min(100, (pass.remainingHours / pass.totalHours) * 100)
                            : 0;
                          return (
                            <div key={pass.id}>
                              <span className="user-detail-pass-icon"><Award size={15} /></span>
                              <p>
                                <strong>{pass.passType} Pass</strong>
                                <small>
                                  {pass.remainingHours.toLocaleString('en-IN', { maximumFractionDigits: 1 })}h remaining
                                  {' · '}
                                  expires {joinedDate(pass.expiresAt)}
                                </small>
                                <span className="user-detail-pass-progress">
                                  <i style={{ width: `${remainingPercent}%` }} />
                                </span>
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="user-detail-empty">No active passes.</p>
                    )}
                  </section>
                </aside>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <style>{`
        .user-detail-backdrop { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center; padding: 18px; background: rgba(2, 5, 10, 0.82); }
        .user-detail-dialog { width: min(980px, 100%); max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid rgba(124, 150, 190, 0.18); border-top-color: rgba(0, 212, 255, 0.62); border-radius: 8px; background: #101a29; box-shadow: 0 26px 80px rgba(0, 0, 0, 0.55); color: var(--color-text-primary); }
        .user-detail-header { position: relative; min-height: 92px; display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 17px 20px; border-bottom: 1px solid rgba(124, 150, 190, 0.14); background: #111d2e; }
        .user-detail-avatar { width: 56px; height: 56px; display: grid; place-items: center; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 8px; background: var(--gradient-primary); box-shadow: 0 8px 22px rgba(56, 82, 180, 0.25); color: white; font-family: 'Orbitron', sans-serif; font-size: 1.15rem; font-weight: 900; }
        .user-detail-identity { min-width: 0; display: grid; justify-items: start; gap: 3px; }
        .user-detail-eyebrow { display: inline-flex; align-items: center; gap: 5px; color: var(--color-accent-secondary); font-size: 0.64rem; font-weight: 800; text-transform: uppercase; }
        .user-detail-name-row { min-width: 0; max-width: 100%; display: flex; align-items: center; gap: 8px; }
        .user-detail-identity h2 { margin: 0; overflow: hidden; font-family: 'Orbitron', sans-serif; font-size: 1.12rem; letter-spacing: 0; text-overflow: ellipsis; white-space: nowrap; }
        .user-detail-identity > small { color: #61708a; font-family: monospace; font-size: 0.69rem; }
        .user-detail-role { padding: 3px 6px; border: 1px solid rgba(0, 212, 255, 0.18); border-radius: 4px; background: rgba(0, 212, 255, 0.06); color: #89dff0; font-size: 0.61rem; font-weight: 800; text-transform: uppercase; }
        .user-detail-header-actions { display: flex; align-items: center; gap: 9px; }
        .user-detail-gems { min-height: 36px; display: inline-flex; align-items: center; gap: 6px; padding: 0 11px; border: 1px solid rgba(190, 137, 255, 0.22); border-radius: 6px; background: rgba(170, 100, 255, 0.08); color: #cfa9ff; font-size: 0.72rem; white-space: nowrap; }
        .user-detail-gems b { color: #ead9ff; font-size: 0.83rem; }
        .user-detail-close { width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid rgba(124, 150, 190, 0.12); border-radius: 6px; background: rgba(255, 255, 255, 0.025); color: #74829a; cursor: pointer; }
        .user-detail-close:hover { border-color: rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: white; }
        .user-detail-close:focus-visible { outline: 2px solid var(--color-accent-secondary); outline-offset: 2px; }
        .user-detail-scroll { overflow-y: auto; overscroll-behavior: contain; }
        .user-detail-state { min-height: 320px; display: grid; place-content: center; justify-items: center; gap: 10px; color: var(--color-text-muted); }
        .user-detail-state.error { color: var(--color-accent-error); }
        .user-detail-contact { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(160px, 0.8fr) minmax(170px, 0.75fr); border-bottom: 1px solid rgba(124, 150, 190, 0.12); background: rgba(5, 10, 18, 0.18); }
        .user-detail-contact > div { min-width: 0; min-height: 66px; display: grid; grid-template-columns: 31px minmax(0, 1fr); align-items: center; gap: 9px; padding: 10px 20px; border-right: 1px solid rgba(124, 150, 190, 0.1); }
        .user-detail-contact > div:last-child { border-right: 0; }
        .user-detail-contact > div > span { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 6px; background: rgba(0, 212, 255, 0.07); color: #62cde3; }
        .user-detail-contact p { min-width: 0; display: grid; gap: 2px; margin: 0; }
        .user-detail-contact small { color: #5d6b82; font-size: 0.62rem; font-weight: 800; text-transform: uppercase; }
        .user-detail-contact strong { overflow: hidden; color: #bdc9dc; font-size: 0.75rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .user-detail-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-bottom: 1px solid rgba(124, 150, 190, 0.14); background: #0d1624; }
        .user-detail-metrics > div { --metric-color: #00d4ff; --metric-rgb: 0, 212, 255; min-width: 0; min-height: 104px; display: grid; grid-template-columns: 37px minmax(0, 1fr); align-items: center; gap: 11px; padding: 14px 18px; border-right: 1px solid rgba(124, 150, 190, 0.11); }
        .user-detail-metrics > div:last-child { border-right: 0; }
        .user-detail-metrics > div.spent { --metric-color: #00d98b; --metric-rgb: 0, 217, 139; }
        .user-detail-metrics > div.value { --metric-color: #f4b942; --metric-rgb: 244, 185, 66; }
        .user-detail-metrics > div.hours { --metric-color: #a99cff; --metric-rgb: 169, 156, 255; }
        .user-detail-metric-icon { width: 37px; height: 37px; display: grid; place-items: center; border: 1px solid rgba(var(--metric-rgb), 0.24); border-radius: 7px; background: rgba(var(--metric-rgb), 0.09); color: var(--metric-color); }
        .user-detail-metrics p { min-width: 0; display: grid; gap: 2px; margin: 0; }
        .user-detail-metrics small { color: #64728a; font-size: 0.62rem; font-weight: 800; text-transform: uppercase; }
        .user-detail-metrics strong { overflow: hidden; color: var(--metric-color); font-family: 'Orbitron', sans-serif; font-size: 1.02rem; text-overflow: ellipsis; white-space: nowrap; }
        .user-detail-metrics p > span { color: #5f6e86; font-size: 0.65rem; }
        .user-detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 310px; }
        .user-detail-main { min-width: 0; padding: 18px 20px 20px; }
        .user-detail-side { min-width: 0; border-left: 1px solid rgba(124, 150, 190, 0.12); background: rgba(5, 10, 18, 0.18); }
        .user-detail-side-section { padding: 16px 17px; border-bottom: 1px solid rgba(124, 150, 190, 0.12); }
        .user-detail-side-section:last-child { border-bottom: 0; }
        .user-detail-section-title { min-height: 30px; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
        .user-detail-section-title > div { display: flex; align-items: center; gap: 7px; color: #7183a0; }
        .user-detail-section-title h3 { margin: 0; color: #dce5f4; font-size: 0.82rem; }
        .user-detail-section-title > span { min-width: 24px; padding: 3px 6px; border-radius: 4px; background: rgba(255, 255, 255, 0.04); color: #6e7d94; font-size: 0.66rem; text-align: center; }
        .user-detail-status-list { display: grid; }
        .user-detail-status-list > span { min-height: 34px; display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 8px; border-bottom: 1px solid rgba(124, 150, 190, 0.08); color: #8493aa; font-size: 0.72rem; }
        .user-detail-status-list > span:last-child { border-bottom: 0; }
        .user-detail-status-list i { width: 7px; height: 7px; border-radius: 50%; background: #f4b942; }
        .user-detail-status-list b { color: #dce5f4; font-family: 'Orbitron', sans-serif; font-size: 0.72rem; }
        .user-detail-status-list .confirmed i { background: #39d98a; }
        .user-detail-status-list .checked-in i { background: #00d4ff; }
        .user-detail-status-list .completed i { background: #a99cff; }
        .user-detail-status-list .cancelled i { background: #ff6e78; }
        .user-detail-moments { position: relative; display: grid; gap: 2px; margin-left: 8px; padding-left: 18px; border-left: 1px solid rgba(0, 212, 255, 0.2); }
        .user-detail-moment { position: relative; min-height: 66px; display: grid; grid-template-columns: minmax(0, 1fr); align-content: center; }
        .user-detail-moment-marker { position: absolute; left: -30px; top: 22px; width: 23px; height: 23px; display: grid; place-items: center; border: 1px solid rgba(0, 212, 255, 0.22); border-radius: 50%; background: #101a29; color: #5ccce2; }
        .user-detail-moment > div { min-width: 0; display: grid; gap: 3px; }
        .user-detail-moment > div > span { color: #5f6f87; font-size: 0.61rem; font-weight: 800; text-transform: uppercase; }
        .user-detail-moment strong { overflow: hidden; color: #dce5f4; font-size: 0.75rem; text-overflow: ellipsis; white-space: nowrap; }
        .user-detail-moment strong.muted, .user-detail-moment small { color: #66758c; font-weight: 500; }
        .user-detail-moment small { overflow: hidden; font-size: 0.66rem; text-overflow: ellipsis; white-space: nowrap; }
        .user-detail-passes { display: grid; }
        .user-detail-passes > div { min-height: 70px; display: grid; grid-template-columns: 31px minmax(0, 1fr); align-items: start; gap: 9px; padding: 8px 0; border-bottom: 1px solid rgba(124, 150, 190, 0.08); }
        .user-detail-passes > div:last-child { border-bottom: 0; }
        .user-detail-pass-icon { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 6px; background: rgba(244, 185, 66, 0.1); color: #f4b942; }
        .user-detail-passes p { min-width: 0; display: grid; gap: 4px; margin: 0; }
        .user-detail-passes strong { color: #dce5f4; font-size: 0.75rem; }
        .user-detail-passes small { color: #697991; font-size: 0.65rem; line-height: 1.4; }
        .user-detail-pass-progress { height: 3px; overflow: hidden; border-radius: 3px; background: rgba(255, 255, 255, 0.06); }
        .user-detail-pass-progress i { display: block; height: 100%; border-radius: inherit; background: #f4b942; }
        .user-detail-empty { margin: 0; padding: 18px 0; color: #607087; font-size: 0.76rem; }
        .user-detail-bookings { border-top: 1px solid rgba(124, 150, 190, 0.12); }
        .user-detail-booking { min-width: 0; display: grid; grid-template-columns: 44px minmax(0, 1fr) 74px; align-items: center; gap: 11px; min-height: 82px; padding: 10px 4px; border-bottom: 1px solid rgba(124, 150, 190, 0.1); }
        .user-detail-booking:last-child { border-bottom: 0; }
        .user-detail-booking:hover { background: rgba(255, 255, 255, 0.018); }
        .user-detail-booking-date { width: 42px; height: 48px; display: grid; place-content: center; gap: 1px; border: 1px solid rgba(0, 212, 255, 0.16); border-radius: 6px; background: rgba(0, 212, 255, 0.055); text-align: center; }
        .user-detail-booking-date strong { color: #dce5f4; font-family: 'Orbitron', sans-serif; font-size: 0.82rem; }
        .user-detail-booking-date span { color: #58cce3; font-size: 0.58rem; font-weight: 800; text-transform: uppercase; }
        .user-detail-booking-main { min-width: 0; display: grid; gap: 4px; }
        .user-detail-booking-heading { min-width: 0; display: flex; align-items: center; gap: 8px; }
        .user-detail-booking-heading > strong { min-width: 0; display: flex; align-items: center; gap: 6px; overflow: hidden; color: #dce5f4; font-size: 0.76rem; text-overflow: ellipsis; white-space: nowrap; }
        .user-detail-booking-heading > strong svg { flex: 0 0 auto; color: #677995; }
        .user-detail-booking-time { color: #8a99b0; font-size: 0.7rem; }
        .user-detail-booking-main > small { overflow: hidden; color: #596a82; font-size: 0.64rem; text-overflow: ellipsis; white-space: nowrap; }
        .user-detail-booking-price { display: grid; justify-items: end; gap: 3px; }
        .user-detail-booking-price span { color: #596980; font-size: 0.59rem; font-weight: 800; text-transform: uppercase; }
        .user-detail-booking-price strong { color: #74d9ed; font-family: 'Orbitron', sans-serif; font-size: 0.78rem; }
        .user-detail-status { flex: 0 0 auto; padding: 3px 5px; border: 1px solid rgba(124, 150, 190, 0.14); border-radius: 4px; background: rgba(255, 255, 255, 0.025); color: #8c9bb0; font-size: 0.56rem; font-weight: 800; text-transform: uppercase; white-space: nowrap; }
        .user-detail-status.confirmed { border-color: rgba(57, 217, 138, 0.2); background: rgba(57, 217, 138, 0.07); color: #60dda0; }
        .user-detail-status.checked_in { border-color: rgba(0, 212, 255, 0.2); background: rgba(0, 212, 255, 0.07); color: #58d9f1; }
        .user-detail-status.completed { border-color: rgba(169, 156, 255, 0.2); background: rgba(169, 156, 255, 0.07); color: #b6aaff; }
        .user-detail-status.cancelled { border-color: rgba(255, 110, 120, 0.2); background: rgba(255, 110, 120, 0.07); color: #ff8992; }
        .user-detail-status.pending { border-color: rgba(244, 185, 66, 0.2); background: rgba(244, 185, 66, 0.07); color: #f4c766; }
        @media (max-width: 760px) {
          .user-detail-backdrop { padding: 8px; }
          .user-detail-dialog { max-height: 95vh; }
          .user-detail-header { min-height: 82px; grid-template-columns: 48px minmax(0, 1fr) auto; gap: 10px; padding: 13px 14px; }
          .user-detail-avatar { width: 48px; height: 48px; }
          .user-detail-gems span { display: none; }
          .user-detail-gems { min-width: 38px; justify-content: center; padding: 0 7px; }
          .user-detail-contact { grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.8fr); }
          .user-detail-contact > div { min-height: 60px; padding: 8px 13px; }
          .user-detail-contact > div:nth-child(2) { border-right: 0; }
          .user-detail-contact > div:last-child { grid-column: 1 / -1; border-top: 1px solid rgba(124, 150, 190, 0.1); }
          .user-detail-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .user-detail-metrics > div { min-height: 91px; border-bottom: 1px solid rgba(124, 150, 190, 0.11); }
          .user-detail-metrics > div:nth-child(2) { border-right: 0; }
          .user-detail-metrics > div:nth-child(n+3) { border-bottom: 0; }
          .user-detail-layout { grid-template-columns: 1fr; }
          .user-detail-main { padding: 17px 14px 20px; }
          .user-detail-side { order: -1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-bottom: 1px solid rgba(124, 150, 190, 0.12); border-left: 0; }
          .user-detail-side-section { padding: 15px 14px; border-right: 1px solid rgba(124, 150, 190, 0.12); }
          .user-detail-side-section:nth-child(2) { border-right: 0; }
          .user-detail-side-section:last-child { grid-column: 1 / -1; border-top: 1px solid rgba(124, 150, 190, 0.12); }
        }
        @media (max-width: 520px) {
          .user-detail-header { grid-template-columns: 44px minmax(0, 1fr) auto; }
          .user-detail-avatar { width: 44px; height: 44px; font-size: 1rem; }
          .user-detail-name-row { align-items: center; flex-direction: row; gap: 5px; }
          .user-detail-identity h2 { max-width: 100%; font-size: 0.95rem; }
          .user-detail-header-actions { gap: 5px; }
          .user-detail-gems { min-width: 34px; min-height: 32px; padding: 0 5px; }
          .user-detail-close { width: 36px; height: 36px; }
          .user-detail-contact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .user-detail-contact > div { grid-column: auto; border-top: 1px solid rgba(124, 150, 190, 0.08); border-right: 1px solid rgba(124, 150, 190, 0.08); border-bottom: 0; }
          .user-detail-contact > div:first-child { grid-column: 1 / -1; border-top: 0; border-right: 0; }
          .user-detail-contact > div:first-child strong { overflow: visible; overflow-wrap: anywhere; text-overflow: clip; white-space: normal; }
          .user-detail-contact > div:nth-child(2) { border-right: 1px solid rgba(124, 150, 190, 0.08); }
          .user-detail-contact > div:last-child { grid-column: auto; border-top: 1px solid rgba(124, 150, 190, 0.08); border-right: 0; }
          .user-detail-metrics > div { min-height: 88px; grid-template-columns: 32px minmax(0, 1fr); gap: 8px; padding: 11px 10px; }
          .user-detail-metric-icon { width: 32px; height: 32px; }
          .user-detail-metrics strong { font-size: 0.88rem; }
          .user-detail-side { display: block; }
          .user-detail-side-section { border-right: 0; }
          .user-detail-side-section:last-child { border-top: 0; }
          .user-detail-booking { grid-template-columns: 42px minmax(0, 1fr); gap: 10px; }
          .user-detail-booking-price { grid-column: 2; justify-items: start; grid-auto-flow: column; justify-content: start; align-items: baseline; gap: 7px; }
          .user-detail-booking-main > small { white-space: normal; line-height: 1.35; }
          .user-detail-booking-heading { align-items: flex-start; justify-content: space-between; }
        }
      `}</style>
    </div>
  );
}
