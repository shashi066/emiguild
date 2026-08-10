'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  UserPlus, Plus, Trash2, AlertCircle, RefreshCw,
  Calendar, Clock, Monitor, X, CheckCircle, Phone, User, Search, Award, ChevronDown,
  Gamepad2,
} from 'lucide-react';
import { formatDate, formatTime, formatCurrency, getTodayString, isSlotAvailable, getDurationOptions } from '@/lib/utils';
import { decryptPhone } from '@/lib/crypto';
import { isPassDateEligible } from '@/lib/pass-rules';
import {
  ADMIN_WALKIN_TIME_SLOTS,
  validateAdminWalkinTime,
} from '@/lib/admin-walkin-time';
import {
  getGuildMembershipEligibility,
  guildMembershipName,
  selectPreferredGuildMembership,
} from '@/lib/guild-membership';
import { ADMIN_GAME_REQUEST_MAX_LENGTH } from '@/lib/game-request';
import { AdminBookingModalShell } from '@/components/admin/AdminBookingModalShell';

type Station = { id: string; name: string; hourlyRate: number; minDuration: number; hasControllers: boolean };
type BookedSlot = { startTime: string; endTime: string; status: string };
type WalkinBooking = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  stationId: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalPrice: number;
  extraControllers: number;
  status: string;
  notes: string | null;
  passHoursDeducted?: number;
  station: { id: string; name: string };
};
type FoundUser = { id: string; name: string; email: string; phone: string | null };
type ActivePass = {
  id: string;
  passType: string;
  totalHours: number;
  usedHours: number;
  status: string;
  purchasedAt: string;
  expiresAt: string;
};
const PASS_COLOR: Record<string, string> = { BRONZE: '#cd7f32', SILVER: '#c0c0c0', GOLD: '#FFD700', BLACK: '#d8dee9', APEX: '#67e8f9' };
const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: '#10b981',
  PENDING: '#f59e0b',
  CANCELLED: '#ef4444',
  COMPLETED: '#818cf8',
};

// DURATION_OPTIONS is now generated dynamically via getDurationOptions()

export default function WalkinBookingPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [bookings, setBookings] = useState<WalkinBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [controllerPrice, setControllerPrice] = useState(0);

  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterStation, setFilterStation] = useState('');

  useEffect(() => {
    fetch('/api/stations')
      .then((r) => r.json())
      .then((d) => setStations(d.stations ?? []));
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.controller_price) setControllerPrice(parseFloat(d.controller_price));
      });
  }, []);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ bookingType: 'OFFLINE', limit: '100' });
      if (filterDate) params.set('date', filterDate);
      if (filterStation) params.set('stationId', filterStation);
      const res = await fetch(`/api/admin/walkin?${params}`);
      const data = await res.json();
      setBookings((data.bookings ?? []).map((booking: WalkinBooking) => ({
        ...booking,
        customerPhone: decryptPhone(booking.customerPhone),
      })));
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterStation]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this walk-in booking?')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: 'CANCELLED' } : b));
      setSuccess('Walk-in booking cancelled.');
    } finally {
      setDeletingId(null);
    }
  };

  const today = getTodayString();

  const { filteredBookings, groupedBookings } = useMemo(() => {
    const query = search.toLowerCase();
    const filteredResults = bookings.filter((booking) => (
      !search
      || booking.customerName?.toLowerCase().includes(query)
      || booking.customerPhone?.includes(query)
      || booking.station.name.toLowerCase().includes(query)
    ));
    const bookingsByDate = filteredResults.reduce<Record<string, WalkinBooking[]>>((groups, booking) => {
      (groups[booking.date] ??= []).push(booking);
      return groups;
    }, {});
    const sortedGroups = Object.entries(bookingsByDate)
      .sort(([firstDate], [secondDate]) => secondDate.localeCompare(firstDate))
      .map(([date, dateBookings]) => [
        date,
        [...dateBookings].sort((first, second) => first.startTime.localeCompare(second.startTime)),
      ] as const);

    return { filteredBookings: filteredResults, groupedBookings: sortedGroups };
  }, [bookings, search]);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <UserPlus size={26} style={{ display: 'inline', marginRight: 10, color: 'var(--color-accent-primary)' }} />
            Walk-in Bookings
          </h1>
          <p className="page-subtitle">Book slots for offline / walk-in customers</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-ghost btn-sm" onClick={loadBookings} id="refresh-walkin-btn">
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setSuccess(''); }} id="new-walkin-btn">
            <Plus size={16} /> New Walk-in Booking
          </button>
        </div>
      </div>

      {/* Alerts */}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-lg)' }}>
          <CheckCircle size={16} /> {success}
        </div>
      )}
      {/* Info */}
      <div className="alert alert-info" style={{ marginBottom: 'var(--space-xl)' }}>
        <UserPlus size={16} style={{ flexShrink: 0 }} />
        <span>
          Walk-in bookings are <strong>auto-confirmed</strong> and marked as <strong>pay at counter</strong>.
          They appear as unavailable to online customers. When payment integration is added, online users will
          need to pay first — but admin can always book for walk-in customers without payment.
        </span>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-input-wrapper" style={{ maxWidth: 260 }}>
          <Search size={15} className="search-icon" />
          <input
            id="walkin-search"
            className="form-input search-input"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <input
          id="walkin-date-filter"
          type="date"
          className="form-input"
          style={{ width: 'auto' }}
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
        />
        <select
          id="walkin-station-filter"
          className="form-input"
          style={{ width: 'auto' }}
          value={filterStation}
          onChange={(e) => setFilterStation(e.target.value)}
        >
          <option value="">All Stations</option>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {(filterDate || filterStation || search) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterDate(''); setFilterStation(''); setSearch(''); }}>
            Clear
          </button>
        )}
      </div>

      {/* Bookings list */}
      {loading ? (
        <div className="loading-state"><div className="spinner" />Loading walk-in bookings...</div>
      ) : filteredBookings.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><UserPlus size={32} /></div>
            <div className="empty-state-title">No Walk-in Bookings</div>
            <p className="empty-state-text">No walk-in bookings yet. Use the button above to create one for a walk-in customer.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          {groupedBookings.map(([date, slots]) => (
              <div key={date}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                  <Calendar size={15} style={{ color: 'var(--color-accent-primary)' }} />
                  <span style={{ fontWeight: 700 }}>{formatDate(date)}</span>
                  {date === today && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'rgba(108,99,255,0.12)', color: 'var(--color-accent-primary)', border: '1px solid rgba(108,99,255,0.3)' }}>TODAY</span>
                  )}
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>· {slots.length} booking{slots.length !== 1 ? 's' : ''}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                  {slots.map((booking) => (
                    <div key={booking.id} className="card" style={{
                      padding: 'var(--space-lg)',
                      borderColor: booking.status === 'CANCELLED' ? 'rgba(239,68,68,0.15)' : 'rgba(108,99,255,0.15)',
                      opacity: booking.status === 'CANCELLED' ? 0.6 : 1,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
                        {/* Left */}
                        <div style={{ flex: 1, minWidth: 220 }}>
                          {/* Customer info */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '1rem' }}>
                              <User size={15} style={{ color: 'var(--color-accent-primary)' }} />
                              {booking.customerName}
                            </div>
                            {booking.customerPhone && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                <Phone size={13} />
                                {booking.customerPhone}
                              </div>
                            )}
                            {/* Status badge */}
                            <span style={{
                              padding: '3px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                              textTransform: 'uppercase', letterSpacing: '0.05em',
                              background: `${STATUS_COLORS[booking.status]}22`,
                              color: STATUS_COLORS[booking.status],
                              border: `1px solid ${STATUS_COLORS[booking.status]}44`,
                            }}>
                              {booking.status}
                            </span>
                            {/* Walk-in badge */}
                            <span style={{
                              padding: '3px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                              background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)',
                            }}>
                              🚶 Walk-in
                            </span>
                            {/* Pass badge */}
                            {(booking.passHoursDeducted ?? 0) > 0 && (
                              <span style={{
                                padding: '3px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                                background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)',
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}>
                                <Award size={10} /> Pass Used
                              </span>
                            )}
                          </div>

                          {/* Station + time */}
                          <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Monitor size={14} style={{ color: 'var(--color-accent-primary)' }} />
                              {booking.station.name}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Clock size={14} style={{ color: 'var(--color-accent-primary)' }} />
                              {formatTime(booking.startTime)} — {formatTime(booking.endTime)}
                              <span style={{ color: 'var(--color-text-muted)' }}>({booking.duration}h)</span>
                            </span>
                            {booking.extraControllers > 0 && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                🎮 +{booking.extraControllers} controller{booking.extraControllers > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          {booking.notes && (
                            <div className="game-request-note compact">
                              <Gamepad2 size={12} aria-hidden="true" />
                              <span><strong>Game:</strong> {booking.notes}</span>
                            </div>
                          )}

                          {/* Booking ID */}
                          <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                            ID: #{booking.id.slice(-8).toUpperCase()} · Pay at counter
                          </div>
                        </div>

                        {/* Right: price + cancel */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-sm)' }}>
                          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-accent-primary)' }}>
                            {formatCurrency(booking.totalPrice)}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Due at counter</div>
                          {booking.status !== 'CANCELLED' && booking.status !== 'COMPLETED' && (
                            <button
                              className="btn btn-sm"
                              style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                              onClick={() => handleCancel(booking.id)}
                              disabled={deletingId === booking.id}
                              id={`cancel-walkin-${booking.id}`}
                            >
                              <Trash2 size={13} />
                              {deletingId === booking.id ? 'Cancelling...' : 'Cancel'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ── Walk-in Booking Form Modal ── */}
      {showForm && (
        <WalkinBookingModal
          stations={stations}
          controllerPrice={controllerPrice}
          onClose={() => setShowForm(false)}
          onCreated={(message) => {
            setShowForm(false);
            setSuccess(message);
            void loadBookings();
          }}
        />
      )}
    </div>
  );
}

type WalkinBookingModalProps = {
  stations: Station[];
  controllerPrice: number;
  onClose: () => void;
  onCreated: (message: string) => void;
};

function WalkinBookingModal({ stations, controllerPrice, onClose, onCreated }: WalkinBookingModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [form, setForm] = useState(() => ({
    customerName: '',
    customerPhone: '',
    stationId: '',
    date: getTodayString(),
    startTime: '09:00',
    duration: 2,
    extraControllers: 0,
    discount: 0,
    appliedBenefitType: null as string | null,
    notes: '',
  }));
  const [allUsers, setAllUsers] = useState<FoundUser[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [showUserDrop, setShowUserDrop] = useState(false);
  const [selectedUser, setSelectedUser] = useState<FoundUser | null>(null);
  const [activePasses, setActivePasses] = useState<ActivePass[]>([]);
  const [usePass, setUsePass] = useState(false);
  const [loadingPass, setLoadingPass] = useState(false);
  const userWrapRef = useRef<HTMLDivElement>(null);
  const deferredUserQuery = useDeferredValue(userQuery);

  useEffect(() => {
    let mounted = true;

    fetch('/api/admin/passes/users')
      .then((response) => response.json())
      .then((data) => {
        if (!mounted) return;
        setAllUsers((data.users ?? []).map((user: FoundUser) => ({
          ...user,
          phone: decryptPhone(user.phone),
        })));
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (userWrapRef.current && !userWrapRef.current.contains(event.target as Node)) {
        setShowUserDrop(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!form.stationId || !form.date) {
      setBookedSlots([]);
      return () => {
        mounted = false;
      };
    }

    fetch(`/api/slots?stationId=${form.stationId}&date=${form.date}`)
      .then((response) => response.json())
      .then((data) => {
        if (mounted) setBookedSlots(data.bookings ?? []);
      });

    return () => {
      mounted = false;
    };
  }, [form.stationId, form.date]);

  const selectedStation = stations.find((station) => station.id === form.stationId);
  const activePass = selectedStation
    ? activePasses.find((pass) => (
        selectedStation.hasControllers
          ? ['BRONZE', 'SILVER', 'GOLD'].includes(pass.passType)
          : ['BLACK', 'APEX'].includes(pass.passType)
      )) ?? null
    : null;
  const stationPassAllowed = selectedStation != null;
  const passDateAllowed = isPassDateEligible(form.date);
  const activeMembership = selectPreferredGuildMembership(activePasses);
  const membershipEligibility = getGuildMembershipEligibility({
    membership: activeMembership,
    bookingDate: form.date,
    hasControllers: selectedStation?.hasControllers ?? false,
    extraControllers: form.extraControllers,
  });
  const controllerCharge = form.extraControllers * controllerPrice * form.duration;
  const sessionCost = selectedStation ? selectedStation.hourlyRate * form.duration : 0;
  const priceBeforeDiscount = (usePass ? 0 : sessionCost) + controllerCharge;
  const estimatedTotal = Math.round(priceBeforeDiscount * (1 - form.discount / 100));

  useEffect(() => {
    if ((!activePass || !passDateAllowed) && usePass) {
      setUsePass(false);
    }
  }, [activePass, passDateAllowed, usePass]);

  useEffect(() => {
    if (form.appliedBenefitType && !membershipEligibility.eligible) {
      setForm((current) => ({
        ...current,
        discount: 0,
        appliedBenefitType: null,
      }));
    }
  }, [form.appliedBenefitType, membershipEligibility.eligible]);

  const filteredUsers = useMemo(() => {
    const query = deferredUserQuery.trim().toLowerCase();
    if (!query) return [];

    return allUsers.filter((user) => (
      user.name.toLowerCase().includes(query)
      || user.email.toLowerCase().includes(query)
      || (user.phone ?? '').includes(query)
    )).slice(0, 8);
  }, [allUsers, deferredUserQuery]);

  const availableSlots = useMemo(() => ADMIN_WALKIN_TIME_SLOTS.filter((time) => (
    validateAdminWalkinTime(time, form.duration).valid
    && isSlotAvailable(time, form.duration, bookedSlots)
  )), [bookedSlots, form.duration]);

  const fetchPassForUser = async (userId: string) => {
    setLoadingPass(true);
    setActivePasses([]);
    setUsePass(false);
    try {
      const response = await fetch(`/api/admin/passes?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setActivePasses(data.passes ?? []);
      }
    } finally {
      setLoadingPass(false);
    }
  };

  const handleSelectUser = (user: FoundUser) => {
    setSelectedUser(user);
    setUserQuery('');
    setShowUserDrop(false);
    setForm((current) => ({
      ...current,
      customerName: user.name,
      customerPhone: user.phone ?? '',
    }));
    void fetchPassForUser(user.id);
  };

  const handleClearUser = () => {
    setSelectedUser(null);
    setActivePasses([]);
    setUsePass(false);
    setUserQuery('');
    setForm((current) => ({ ...current, customerName: '', customerPhone: '' }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/walkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          duration: Number(form.duration),
          usePass,
          passId: usePass ? activePass?.id ?? null : null,
          linkedUserId: selectedUser?.id ?? null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Booking failed.');
        return;
      }
      onCreated(`✅ Walk-in booking created for ${data.booking.customerName} — ${data.booking.station.name}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminBookingModalShell onClose={onClose} labelledBy="walkin-booking-title">

            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
              <h2 id="walkin-booking-title" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                <UserPlus size={20} style={{ display: 'inline', marginRight: 8, color: 'var(--color-accent-primary)' }} />
                New Walk-in Booking
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close walk-in booking form"><X size={18} /></button>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)' }}>
                <AlertCircle size={15} /> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {/* Customer section */}
              <div style={{ background: 'rgba(108,99,255,0.04)', border: '1px solid rgba(108,99,255,0.12)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-md)' }}>
                  Customer Details
                </div>

                {/* Search-select for registered users */}
                <div className="form-group" style={{ marginBottom: 'var(--space-md)' }}>
                  <label className="form-label">Search Registered Customer <span style={{ color: 'var(--color-text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
                  <div ref={userWrapRef} style={{ position: 'relative' }}>
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '0 12px', height: 42,
                        background: 'var(--color-bg-elevated)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'text',
                        transition: 'border-color 0.15s',
                      }}
                      onClick={() => { if (!selectedUser) document.getElementById('walkin-user-search')?.focus(); }}
                    >
                      <Search size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                      {selectedUser ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '3px 10px 3px 8px', borderRadius: 999,
                          background: 'rgba(108,99,255,0.15)', border: '1px solid rgba(108,99,255,0.3)',
                          fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-accent-primary)',
                          whiteSpace: 'nowrap',
                        }}>
                          <User size={11} />
                          {selectedUser.name}{selectedUser.phone ? ` · ${selectedUser.phone}` : ''}
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleClearUser(); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent-primary)', display: 'flex', alignItems: 'center', padding: 0 }}>
                            <X size={12} />
                          </button>
                        </span>
                      ) : (
                        <input
                          id="walkin-user-search"
                          type="text"
                          placeholder="Search by name, email or phone…"
                          value={userQuery}
                          onChange={(e) => { setUserQuery(e.target.value); setShowUserDrop(true); }}
                          onFocus={() => { if (userQuery) setShowUserDrop(true); }}
                          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--color-text-primary)', fontFamily: 'inherit', fontSize: '0.875rem' }}
                        />
                      )}
                      <ChevronDown size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0, transform: showUserDrop ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </div>

                    {/* Dropdown */}
                    {!selectedUser && showUserDrop && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
                        background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-accent)',
                        borderRadius: 'var(--radius-md)', boxShadow: '0 10px 32px rgba(0,0,0,0.4)',
                        overflow: 'hidden',
                      }}>
                        {filteredUsers.length > 0 ? filteredUsers.map((u) => (
                          <button key={u.id} type="button"
                            onMouseDown={() => handleSelectUser(u)}
                            style={{
                              width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none',
                              border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 10,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(108,99,255,0.1)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                          >
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <User size={14} style={{ color: 'white' }} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-primary)' }}>{u.name}</div>
                              <div style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)' }}>{u.phone ?? 'No phone'} · {u.email}</div>
                            </div>
                          </button>
                        )) : (
                          <div style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                            {userQuery.trim() ? `No customers matching "${userQuery}"` : 'Start typing to search…'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {loadingPass && <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Checking pass…</div>}
                </div>

                {/* Name + Phone — always editable, pre-filled when user selected */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="walkin-name">Customer Name *</label>
                    <input
                      id="walkin-name"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Rahul Sharma"
                      value={form.customerName}
                      onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="walkin-phone">
                      Phone <span style={{ color: 'var(--color-text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                    </label>
                    <input
                      id="walkin-phone"
                      type="tel"
                      className="form-input"
                      placeholder="e.g. 9876543210"
                      value={form.customerPhone}
                      onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                    />
                  </div>
                </div>
              </div>


              {/* Booking section */}
              <div style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.1)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-md)' }}>
                  Slot Details
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="walkin-station">Station *</label>
                    <select
                      id="walkin-station"
                      className="form-input"
                      value={form.stationId}
                      onChange={(e) => {
                        const st = stations.find((s) => s.id === e.target.value);
                        setForm({ ...form, stationId: e.target.value, duration: st?.minDuration ?? 1 });
                      }}
                      required
                    >
                      <option value="">Select a station...</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {formatCurrency(s.hourlyRate)}/hr{s.hasControllers === false ? ' · Racing pass eligible' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="walkin-date">Date *</label>
                      <input
                        id="walkin-date"
                        type="date"
                        className="form-input"
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="walkin-start">Start Time *</label>
                      <select
                        id="walkin-start"
                        className="form-input"
                        value={availableSlots.includes(form.startTime) ? form.startTime : ''}
                        onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                        required
                        disabled={!form.stationId || !form.date}
                      >
                        <option value="">
                          {!form.stationId || !form.date
                            ? 'Select station & date first'
                            : availableSlots.length === 0
                            ? 'No slots available'
                            : 'Select start time...'}
                        </option>
                        {availableSlots.map((t) => (
                          <option key={t} value={t}>{formatTime(t)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Duration *</label>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                      {getDurationOptions(selectedStation?.minDuration ?? 1).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`btn btn-sm ${form.duration === opt.value ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setForm({ ...form, duration: opt.value })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {controllerPrice > 0 && selectedStation?.hasControllers && (
                    <div className="form-group">
                      <label className="form-label">
                        Extra Controllers
                        <span style={{ color: 'var(--color-text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                          {' '}— {formatCurrency(controllerPrice)}/hr each
                        </span>
                      </label>
                      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        {[0, 1, 2, 3].map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={`btn btn-sm ${form.extraControllers === n ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setForm({ ...form, extraControllers: n })}
                          >
                            {n === 0 ? 'None' : `+${n}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" htmlFor="walkin-discount">
                      Discount <span style={{ color: 'var(--color-text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional, 10–100%)</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        id="walkin-discount"
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={form.discount}
                        disabled={usePass}
                        onChange={(e) => setForm({
                          ...form,
                          discount: Number(e.target.value),
                          appliedBenefitType: null,
                        })}
                        style={{ flex: 1, accentColor: 'var(--color-accent-secondary)' }}
                      />
                      <span style={{ minWidth: 44, textAlign: 'right', fontWeight: 700, color: form.discount > 0 ? 'var(--color-accent-secondary)' : 'var(--color-text-muted)', fontFamily: 'Orbitron, sans-serif', fontSize: '0.9rem' }}>
                        {form.discount}%
                      </span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="walkin-notes">
                      Game Request / Notes <span className="form-optional">(optional)</span>
                    </label>
                    <input
                      id="walkin-notes"
                      type="text"
                      className="form-input"
                      placeholder="Game to prepare or an operational note..."
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      maxLength={ADMIN_GAME_REQUEST_MAX_LENGTH}
                    />
                  </div>
                </div>
              </div>

              {selectedUser && selectedStation && activeMembership && (
                <section
                  aria-label="Active Guild Membership"
                  style={{
                    padding: 'var(--space-md)',
                    borderLeft: `3px solid ${activeMembership.passType === 'GUILD_MASTER' ? '#f4cf58' : '#60a5fa'}`,
                    background: membershipEligibility.eligible
                      ? 'rgba(74,222,128,0.05)'
                      : 'rgba(245,158,11,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ color: activeMembership.passType === 'GUILD_MASTER' ? '#f4cf58' : '#93c5fd' }}>
                        {guildMembershipName(activeMembership.passType)}
                      </strong>
                      <div style={{ marginTop: 3, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        Expires {new Date(activeMembership.expiresAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      disabled={!membershipEligibility.eligible || usePass}
                      onClick={() => {
                        setUsePass(false);
                        setForm((current) => ({
                          ...current,
                          discount: 50,
                          appliedBenefitType: activeMembership.passType,
                        }));
                      }}
                    >
                      Apply Guild Discount
                    </button>
                  </div>
                  <div style={{ marginTop: 8, fontSize: '0.78rem', color: membershipEligibility.eligible ? '#4ade80' : '#f59e0b' }}>
                    {membershipEligibility.reason}
                  </div>
                  {form.appliedBenefitType && (
                    <div style={{ marginTop: 5, fontSize: '0.75rem', fontWeight: 700, color: '#4ade80' }}>
                      50% Guild discount selected. Account-holder presence must be verified.
                    </div>
                  )}
                </section>
              )}

              {/* Pass toggle — shown only when registered user has an active pass */}
              {selectedUser && activePass && (
                <div style={{
                  borderRadius: 'var(--radius-md)',
                  border: usePass ? `1px solid ${PASS_COLOR[activePass.passType]}55` : '1px solid var(--color-border)',
                  background: usePass ? `${PASS_COLOR[activePass.passType]}0a` : 'var(--color-bg-elevated)',
                  padding: 'var(--space-md)',
                  transition: 'all 0.2s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: usePass || !passDateAllowed ? 10 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Award size={15} style={{ color: PASS_COLOR[activePass.passType] }} />
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: PASS_COLOR[activePass.passType] }}>
                        {activePass.passType} PASS available
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                        {activePass.totalHours - activePass.usedHours}/{activePass.totalHours} hrs left
                      </span>
                    </div>
                    {/* Toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!stationPassAllowed || !passDateAllowed) return;
                        const nextUsePass = !usePass;
                        setUsePass(nextUsePass);
                        if (nextUsePass) {
                          setForm((current) => ({
                            ...current,
                            discount: 0,
                            appliedBenefitType: null,
                          }));
                        }
                      }}
                      disabled={!stationPassAllowed || !passDateAllowed}
                      style={{
                        width: 44, height: 24, borderRadius: 12,
                        background: usePass ? PASS_COLOR[activePass.passType] : 'rgba(255,255,255,0.1)',
                        border: 'none', cursor: stationPassAllowed && passDateAllowed ? 'pointer' : 'not-allowed', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                        opacity: stationPassAllowed && passDateAllowed ? 1 : 0.5,
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 2, left: usePass ? 22 : 2, width: 20, height: 20,
                        borderRadius: '50%', background: 'white', transition: 'left 0.2s', display: 'block',
                      }} />
                    </button>
                  </div>
                  {!passDateAllowed && (
                    <div style={{ fontSize: '0.78rem', color: '#f59e0b' }}>
                      Passes are available Monday through Friday only.
                    </div>
                  )}
                  {usePass && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'flex', gap: 16 }}>
                      <span>✅ Session cost: <s style={{ opacity: 0.5 }}>{selectedStation ? `₹${(selectedStation.hourlyRate * form.duration).toLocaleString('en-IN')}` : '—'}</s> <strong style={{ color: 'var(--color-accent-success)' }}>₹0</strong></span>
                      <span style={{ color: 'var(--color-text-muted)' }}>Expires: {new Date(activePass.expiresAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                    </div>
                  )}
                </div>
              )}

              {/* No pass found for registered user */}
              {selectedUser && selectedStation && !activePass && !loadingPass && (
                <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.8rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Award size={13} />
                  {selectedUser.name} has no compatible pass for this station — booking will be charged normally.
                </div>
              )}

              {/* Summary preview */}
              {form.stationId && form.date && form.customerName && (
                <div style={{
                  padding: 'var(--space-md)',
                  background: 'rgba(0,230,118,0.05)',
                  border: '1px solid rgba(0,230,118,0.2)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--color-accent-success)' }}>✓ Booking Summary</div>
                  <div style={{ color: 'var(--color-text-secondary)' }}>
                    <strong>{form.customerName}</strong> · {stations.find((s) => s.id === form.stationId)?.name}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)' }}>
                    {formatDate(form.date)} · {formatTime(form.startTime)} for {form.duration}h
                    {form.extraControllers > 0 && ` · +${form.extraControllers} controller${form.extraControllers > 1 ? 's' : ''}`}
                  </div>
                  <div style={{ color: usePass ? 'var(--color-accent-success)' : 'var(--color-accent-primary)', fontWeight: 700, fontFamily: 'Orbitron, sans-serif' }}>
                    {estimatedTotal === 0 && usePass
                      ? <span>₹0 <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>(pass used)</span></span>
                      : <>
                          {form.discount > 0 && (
                            <span style={{ fontWeight: 400, fontSize: '0.82rem', color: 'var(--color-text-muted)', marginRight: 8 }}>
                              <s>{formatCurrency(priceBeforeDiscount)}</s> −{form.discount}%
                            </span>
                          )}
                          {formatCurrency(estimatedTotal)} — Pay at counter
                          {form.appliedBenefitType && (
                            <span style={{ display: 'block', marginTop: 2, fontFamily: 'inherit', fontSize: '0.72rem', color: '#4ade80' }}>
                              {guildMembershipName(form.appliedBenefitType)} discount
                            </span>
                          )}
                        </>
                    }
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={submitting || !form.stationId || !form.customerName}
                  id="walkin-submit-btn"
                >
                  <UserPlus size={16} />
                  {submitting ? 'Creating...' : usePass ? `Book with ${activePass?.passType} Pass` : 'Confirm Walk-in Booking'}
                </button>
              </div>
            </form>
    </AdminBookingModalShell>
  );
}
