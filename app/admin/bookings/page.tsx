'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BookOpen, Search, CheckCircle, XCircle,
  AlertCircle, RefreshCw, Trash2, Globe, UserPlus, Phone, LogIn,
  Pencil, X, MessageSquare, Gamepad2, Plus, Minus,
} from 'lucide-react';
import {
  formatCurrency, formatDate, formatTime,
  getTimeSlotsForDate, CLOSING_HOUR, getTodayString, isSlotAvailable,
} from '@/lib/utils';
import { decryptPhone } from '@/lib/crypto';

type Station = { id: string; name: string; hourlyRate: number };

type Booking = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalPrice: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'CHECKED_IN';
  bookingType: 'ONLINE' | 'OFFLINE';
  customerName: string | null;
  customerPhone: string | null;
  paymentStatus: string;
  notes?: string | null;
  adminComment?: string | null;
  stationId: string;
  extraControllers: number;
  controllerCharge: number;
  discount: number;
  user: { id: string; name: string; email: string } | null;
  station: { id: string; name: string };
  createdAt: string;
};

const STATUS_CONFIG = {
  PENDING:    { cls: 'badge-pending',   label: 'Pending' },
  CONFIRMED:  { cls: 'badge-confirmed', label: 'Confirmed' },
  CANCELLED:  { cls: 'badge-cancelled', label: 'Cancelled' },
  COMPLETED:  { cls: 'badge-completed', label: 'Completed' },
  CHECKED_IN: { cls: 'badge-checkedin', label: 'Checked In' },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING:    ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:  ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: [],
  CANCELLED:  [],
  COMPLETED:  [],
};

const DURATION_OPTIONS = [1, 2, 3, 4];

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({
  booking,
  stations,
  onClose,
  onSaved,
}: {
  booking: Booking;
  stations: Station[];
  onClose: () => void;
  onSaved: (updated: Booking) => void;
}) {
  const [date, setDate]                   = useState(booking.date);
  const [stationId, setStationId]         = useState(booking.stationId ?? booking.station.id);
  const [startTime, setStartTime]         = useState(booking.startTime);
  const [duration, setDuration]           = useState(booking.duration);
  const [extraControllers, setExtra]      = useState(booking.extraControllers);
  const [discount, setDiscount]           = useState(booking.discount ?? 0);
  const [notes, setNotes]                 = useState(booking.notes ?? '');
  const [customerName, setCustomerName]   = useState(booking.customerName ?? '');
  const [customerPhone, setCustomerPhone] = useState(booking.customerPhone ?? '');
  const [controllerUnitPrice, setCtrlPrice] = useState(0);
  const [bookedSlots, setBookedSlots]       = useState<{ startTime: string; endTime: string; status: string }[]>([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');

  const isOffline = booking.bookingType === 'OFFLINE';

  // Fetch controller unit price from settings
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setCtrlPrice(parseFloat(d.controller_price ?? '0')));
  }, []);

  // Fetch booked slots whenever station or date changes
  useEffect(() => {
    if (!stationId || !date) return;
    const params = new URLSearchParams({ stationId, date, excludeBookingId: booking.id });
    fetch(`/api/slots?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setBookedSlots(data.bookings ?? []))
      .catch(() => setBookedSlots([]));
  }, [stationId, date, booking.id]);

  const selectedStation  = stations.find((s) => s.id === stationId);
  const sessionCost      = (selectedStation?.hourlyRate ?? 0) * duration;
  const controllerCharge = extraControllers * controllerUnitPrice * duration;
  const priceBeforeDiscount = sessionCost + controllerCharge;
  const totalPrice       = Math.round(priceBeforeDiscount * (1 - discount / 100));

  // Time slots — no past-time restriction for admin, but hide already-booked slots
  const availableSlots = getTimeSlotsForDate(date).filter((t) => {
    const slotH = parseInt(t.split(':')[0]);
    if (slotH + duration > CLOSING_HOUR) return false;
    return isSlotAvailable(t, duration, bookedSlots);
  });

  // If currently selected startTime is no longer valid after date change, reset
  const startTimeValid = availableSlots.includes(startTime);

  const handleSave = async () => {
    setError('');
    if (!startTimeValid) {
      setError('Please choose an available start time.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          date, stationId, startTime,
          duration, extraControllers, discount, notes, customerName, customerPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to update.'); return; }
      onSaved({
        ...data.booking,
        customerPhone: decryptPhone(data.booking.customerPhone),
      });
    } catch {
      setError('Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', position: 'relative', animation: 'fadeInUp 0.2s ease' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xl)' }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Edit Booking</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              #{booking.id.slice(-8).toUpperCase()} · {booking.user?.name ?? booking.customerName ?? 'Walk-in'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-lg)' }}><AlertCircle size={15} /> {error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>

          {/* Date */}
          <div className="form-group">
            <label className="form-label">Date</label>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Station */}
          <div className="form-group">
            <label className="form-label">Station</label>
            <select className="form-input" value={stationId} onChange={(e) => setStationId(e.target.value)}>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — ₹{s.hourlyRate}/hr</option>
              ))}
            </select>
          </div>

          {/* Start time + Duration */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            <div className="form-group">
              <label className="form-label">Start Time</label>
              <select
                className="form-input"
                value={startTimeValid ? startTime : ''}
                onChange={(e) => setStartTime(e.target.value)}
              >
                {availableSlots.length === 0 ? (
                  <option value="">No slots available</option>
                ) : (
                  <>
                    {!startTimeValid && <option value="">Select a time</option>}
                    {availableSlots.map((t) => (
                      <option key={t} value={t}>{formatTime(t)}</option>
                    ))}
                  </>
                )}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Duration</label>
              <select className="form-input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d} Hour{d > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Extra Controllers */}
          <div className="form-group">
            <label className="form-label">
              <Gamepad2 size={13} style={{ display: 'inline', marginRight: 4 }} />
              Extra Controllers
              {controllerUnitPrice > 0 && (
                <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 6 }}>
                  (₹{controllerUnitPrice}/hr each)
                </span>
              )}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setExtra(Math.max(0, extraControllers - 1))}
                disabled={extraControllers === 0}
                style={{ width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Minus size={14} />
              </button>
              <div style={{
                minWidth: 40, textAlign: 'center', fontWeight: 700, fontSize: '1.2rem',
                color: extraControllers > 0 ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
              }}>
                {extraControllers}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setExtra(Math.min(3, extraControllers + 1))}
                disabled={extraControllers === 3}
                style={{ width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Plus size={14} />
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {extraControllers === 0 ? 'No extra controllers' : `${extraControllers} extra controller${extraControllers > 1 ? 's' : ''}`}
              </span>
            </div>
          </div>

          {/* Price breakdown */}
          <div style={{ padding: 'var(--space-md)', background: 'rgba(108,99,255,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(108,99,255,0.15)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Session ({duration}h × ₹{selectedStation?.hourlyRate ?? 0})</span>
              <span>₹{sessionCost}</span>
            </div>
            {extraControllers > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  Controllers ({extraControllers} × ₹{controllerUnitPrice} × {duration}h)
                </span>
                <span>₹{controllerCharge}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid rgba(108,99,255,0.15)', paddingTop: 6, color: 'var(--color-accent-primary)' }}>
              <span>Total</span>
              <span>
                {discount > 0 && (
                  <s style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.5, marginRight: 6 }}>₹{priceBeforeDiscount}</s>
                )}
                ₹{totalPrice}
              </span>
            </div>
          </div>

          {/* Discount */}
          <div className="form-group">
            <label className="form-label">Discount <span style={{ color: 'var(--color-text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional, 10–100%)</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--color-accent-secondary)' }}
              />
              <span style={{ minWidth: 44, textAlign: 'right', fontWeight: 700, color: discount > 0 ? 'var(--color-accent-secondary)' : 'var(--color-text-muted)', fontFamily: 'Orbitron, sans-serif', fontSize: '0.9rem' }}>
                {discount}%
              </span>
            </div>
          </div>

          {/* Walk-in customer fields */}
          {isOffline && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label">Customer Name</label>
                <input type="text" className="form-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="tel" className="form-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">Customer Notes</label>
            <textarea
              className="form-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requests or notes..."
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-xl)' }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            onClick={handleSave}
            disabled={loading || !startTimeValid}
          >
            <CheckCircle size={15} />
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminBookingsPage() {
  const [bookings, setBookings]         = useState<Booking[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter]     = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [error, setError]               = useState('');
  const [notice, setNotice]             = useState<{ text: string; success: boolean } | null>(null);
  const [stations, setStations]         = useState<Station[]>([]);

  const [cancelModal, setCancelModal]     = useState<{ id: string; name: string } | null>(null);
  const [cancelComment, setCancelComment] = useState('');
  const [editModal, setEditModal]         = useState<Booking | null>(null);

  useEffect(() => {
    fetch('/api/stations').then((r) => r.json()).then((d) => setStations(d.stations ?? []));
  }, []);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search)       params.set('search',      search);
      if (statusFilter) params.set('status',      statusFilter);
      if (dateFilter)   params.set('date',        dateFilter);
      if (typeFilter)   params.set('bookingType', typeFilter);
      const res = await fetch(`/api/bookings?${params}`);
      const data = await res.json();
      setBookings((data.bookings ?? []).map((booking: Booking) => ({
        ...booking,
        customerPhone: decryptPhone(booking.customerPhone),
      })));
      setTotal(data.total ?? 0);
    } catch {
      setError('Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, dateFilter, typeFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchBookings, 300);
    return () => clearTimeout(timer);
  }, [fetchBookings]);

  const handleStatusChange = async (id: string, newStatus: string, adminComment?: string) => {
    setUpdatingId(id);
    setError('');
    setNotice(null);
    try {
      const body: Record<string, unknown> = { status: newStatus };
      if (adminComment !== undefined) body.adminComment = adminComment;
      const res  = await fetch(`/api/bookings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) {
        setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: newStatus as Booking['status'], adminComment: adminComment ?? b.adminComment } : b));
        if (newStatus === 'CHECKED_IN' && data.artifactAward) {
          const award = data.artifactAward;
          if (award.awarded && award.artifact) {
            setNotice({
              text: `Checked in. ${award.artifact.name} was added to the user's Armory.`,
              success: true,
            });
          } else if (award.reason === 'NO_USER_ACCOUNT') {
            setNotice({ text: 'Checked in without an artifact because this booking has no linked user account.', success: false });
          } else if (award.reason === 'ARMORY_DISABLED') {
            setNotice({ text: 'Checked in without an artifact because Daily Forge is disabled.', success: false });
          } else if (award.reason === 'ALREADY_AWARDED' && award.artifact) {
            setNotice({ text: `Already checked in. The existing ${award.artifact.name} award was kept.`, success: true });
          } else {
            setNotice({ text: 'This booking was already checked in; no additional artifact was awarded.', success: false });
          }
        }
        return true;
      }
      setError(data.error ?? `Failed to update (${res.status})`);
      return false;
    } catch {
      setError('Network error.');
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelModal) return;
    const ok = await handleStatusChange(cancelModal.id, 'CANCELLED', cancelComment);
    if (ok) { setCancelModal(null); setCancelComment(''); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this booking? This cannot be undone.')) return;
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
      if (res.ok) setBookings((prev) => prev.filter((b) => b.id !== id));
    } finally { setUpdatingId(null); }
  };

  const handleEditSaved = (updated: Booking) => {
    setBookings((prev) => prev.map((b) => b.id === updated.id ? { ...b, ...updated } : b));
    setEditModal(null);
  };

  const hasFilters = search || statusFilter || dateFilter || typeFilter;

  return (
    <div>
      {editModal && (
        <EditModal booking={editModal} stations={stations} onClose={() => setEditModal(null)} onSaved={handleEditSaved} />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">All Bookings</h1>
          <p className="page-subtitle">{total} total bookings found</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchBookings} id="refresh-bookings-btn">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-lg)' }}><AlertCircle size={16} /> {error}</div>}
      {notice && (
        <div
          className={notice.success ? 'alert alert-success' : 'alert'}
          style={{ marginBottom: 'var(--space-lg)', ...(!notice.success ? { borderColor: 'rgba(244, 207, 88, 0.35)', color: '#f4cf58', background: 'rgba(244, 207, 88, 0.08)' } : {}) }}
        >
          {notice.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />} {notice.text}
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-input-wrapper" style={{ maxWidth: 300 }}>
          <Search size={16} className="search-icon" />
          <input id="bookings-search" type="text" className="form-input search-input" placeholder="Search name, email, station..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['', 'ONLINE', 'OFFLINE'] as const).map((t) => (
            <button key={t} className={`btn btn-sm ${typeFilter === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTypeFilter(t)} id={`type-filter-${t || 'all'}`}>
              {t === '' && 'All'}
              {t === 'ONLINE'  && <><Globe size={13} /> Online</>}
              {t === 'OFFLINE' && <><UserPlus size={13} /> Walk-in</>}
            </button>
          ))}
        </div>
        <select id="bookings-status-filter" className="form-input" style={{ width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CHECKED_IN">Checked In</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <input id="bookings-date-filter" type="date" className="form-input" style={{ width: 'auto' }} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setStatusFilter(''); setDateFilter(''); setTypeFilter(''); }}>Clear</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-state"><div className="spinner" />Loading bookings...</div>
      ) : bookings.length === 0 ? (
        <div className="table-wrapper">
          <div className="empty-state">
            <div className="empty-state-icon"><BookOpen size={32} /></div>
            <div className="empty-state-title">No Bookings Found</div>
            <p className="empty-state-text">Try adjusting your filters.</p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Customer</th>
                <th>Station</th>
                <th>Date &amp; Time</th>
                <th>Price</th>
                <th>Type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const cfg         = STATUS_CONFIG[b.status];
                const transitions = STATUS_TRANSITIONS[b.status] ?? [];
                const isBusy      = updatingId === b.id;
                const isOffline   = b.bookingType === 'OFFLINE';
                const canEdit     = !['CHECKED_IN', 'CANCELLED'].includes(b.status);

                return (
                  <tr key={b.id} style={{ opacity: isBusy ? 0.5 : 1 }}>

                    {/* Booking ID + notes */}
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                        #{b.id.slice(-8).toUpperCase()}
                      </span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {new Date(b.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </div>
                      {b.notes && (
                        <div style={{ marginTop: 5, display: 'flex', alignItems: 'flex-start', gap: 4, fontSize: '0.72rem', color: '#00d4ff', fontStyle: 'italic', maxWidth: 180 }}>
                          <MessageSquare size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                          <span>{b.notes}</span>
                        </div>
                      )}
                      {b.adminComment && (
                        <div style={{ marginTop: 4, fontSize: '0.7rem', color: 'var(--color-accent-danger)', fontStyle: 'italic', maxWidth: 180 }}>
                          ⚠ {b.adminComment}
                        </div>
                      )}
                    </td>

                    {/* Customer */}
                    <td>
                      {isOffline ? (
                        <>
                          <strong>{b.customerName ?? '—'}</strong>
                          {b.customerPhone && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <Phone size={11} /> {b.customerPhone}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <strong>{b.user?.name ?? '—'}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{b.user?.email}</div>
                        </>
                      )}
                    </td>

                    <td style={{ fontWeight: 600 }}>{b.station.name}</td>

                    <td>
                      <div>{formatDate(b.date)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {formatTime(b.startTime)} – {formatTime(b.endTime)} ({b.duration}h)
                      </div>
                    </td>

                    {/* Price + controllers */}
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--color-accent-primary)' }}>
                        {formatCurrency(b.totalPrice)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                        {b.paymentStatus === 'PAID' ? '✓ Paid' : 'At counter'}
                      </div>
                      {b.extraControllers > 0 && (
                        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: '#ffaa00' }}>
                          <Gamepad2 size={11} />
                          {b.extraControllers} extra · {formatCurrency(b.controllerCharge)}
                        </div>
                      )}
                    </td>

                    <td>
                      {isOffline ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                          <UserPlus size={10} /> Walk-in
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(108,99,255,0.12)', color: 'var(--color-accent-primary)', border: '1px solid rgba(108,99,255,0.3)' }}>
                          <Globe size={10} /> Online
                        </span>
                      )}
                    </td>

                    <td><span className={`badge ${cfg.cls}`}>{cfg.label}</span></td>

                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {canEdit && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditModal(b)}
                            disabled={isBusy}
                            id={`edit-${b.id}`}
                            style={{ color: '#00d4ff', border: '1px solid rgba(0,212,255,0.25)' }}
                            title="Edit booking"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {transitions.includes('CONFIRMED') && (
                          <button className="btn btn-success btn-sm" onClick={() => handleStatusChange(b.id, 'CONFIRMED')} disabled={isBusy} id={`confirm-${b.id}`}>
                            <CheckCircle size={13} /> Confirm
                          </button>
                        )}
                        {transitions.includes('CHECKED_IN') && (
                          <button className="btn btn-sm" style={{ background: 'rgba(0,230,118,0.15)', color: '#00e676', border: '1px solid rgba(0,230,118,0.3)' }} onClick={() => handleStatusChange(b.id, 'CHECKED_IN')} disabled={isBusy} id={`checkin-${b.id}`}>
                            <LogIn size={13} /> Check In
                          </button>
                        )}
                        {transitions.includes('CANCELLED') && (
                          <button className="btn btn-danger btn-sm" onClick={() => { setCancelComment(''); setCancelModal({ id: b.id, name: b.user?.name ?? b.customerName ?? 'Customer' }); }} disabled={isBusy} id={`cancel-${b.id}`}>
                            <XCircle size={13} /> Cancel
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(b.id)} disabled={isBusy} id={`delete-${b.id}`} style={{ color: 'var(--color-accent-danger)' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Cancel modal */}
      {cancelModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setCancelModal(null)}>
          <div className="card" style={{ maxWidth: 440, width: '100%', padding: 'var(--space-xl)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>
              <XCircle size={18} style={{ display: 'inline', marginRight: 6, color: 'var(--color-accent-danger)' }} />
              Cancel Booking
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-lg)' }}>
              Cancelling booking for <strong>{cancelModal.name}</strong>. Add an optional comment.
            </p>
            <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
              <label className="form-label">Cancellation Reason (optional)</label>
              <textarea className="form-input" rows={3} placeholder="e.g. Station under maintenance..." value={cancelComment} onChange={(e) => setCancelComment(e.target.value)} style={{ resize: 'vertical' }} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setCancelModal(null); setError(''); }}>Keep Booking</button>
              <button className="btn btn-danger" onClick={handleCancelConfirm} disabled={!!updatingId} id="confirm-cancel-btn">
                <XCircle size={16} /> {updatingId ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
