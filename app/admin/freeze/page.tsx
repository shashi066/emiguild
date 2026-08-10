'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Snowflake, Plus, Trash2, AlertCircle, RefreshCw,
  Calendar, Clock, Monitor, X, CheckCircle,
} from 'lucide-react';
import { formatDate, formatTime, getTodayString } from '@/lib/utils';

type Station = { id: string; name: string };

type FrozenSlot = {
  id: string;
  stationId: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  notes: string | null;
  station: { id: string; name: string };
};

const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

// Half-hour time slots for more granular freeze options
const TIME_SLOTS: string[] = [];
for (let h = 9; h <= 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 22) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}

export default function FreezeSlotPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [frozenSlots, setFrozenSlots] = useState<FrozenSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterStation, setFilterStation] = useState('');

  // Form state
  const [form, setForm] = useState({
    stationId: '',
    date: getTodayString(),
    startTime: '10:00',
    duration: 2,
    reason: '',
  });

  // Load stations
  useEffect(() => {
    fetch('/api/stations')
      .then((r) => r.json())
      .then((d) => setStations(d.stations ?? []));
  }, []);

  // Load frozen slots
  const loadFrozen = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDate) params.set('date', filterDate);
      if (filterStation) params.set('stationId', filterStation);
      const res = await fetch(`/api/admin/freeze?${params}`);
      const data = await res.json();
      setFrozenSlots(data.frozen ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterStation]);

  useEffect(() => { loadFrozen(); }, [loadFrozen]);

  const handleFreeze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, duration: Number(form.duration) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to freeze slot.');
        return;
      }
      setSuccess(`✅ Slot frozen: ${data.frozen.station.name} on ${formatDate(form.date)} at ${formatTime(form.startTime)}`);
      setShowForm(false);
      setForm({ stationId: '', date: getTodayString(), startTime: '10:00', duration: 2, reason: '' });
      loadFrozen();
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnfreeze = async (id: string) => {
    if (!confirm('Unfreeze this slot? Online customers will be able to book it again.')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/admin/freeze?id=${id}`, { method: 'DELETE' });
      setFrozenSlots((prev) => prev.filter((s) => s.id !== id));
      setSuccess('Slot unfrozen successfully.');
    } finally {
      setDeletingId(null);
    }
  };

  const today = getTodayString();

  // Group frozen slots by date for cleaner display
  const groupedByDate = frozenSlots.reduce<Record<string, FrozenSlot[]>>((acc, slot) => {
    if (!acc[slot.date]) acc[slot.date] = [];
    acc[slot.date].push(slot);
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Snowflake
              size={26}
              style={{ display: 'inline', marginRight: 10, color: '#00d4ff' }}
            />
            Freeze Slots
          </h1>
          <p className="page-subtitle">
            Block time slots for offline / walk-in customers
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-ghost btn-sm" onClick={loadFrozen} id="refresh-freeze-btn">
            <RefreshCw size={15} />
            Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={() => { setShowForm(true); setError(''); setSuccess(''); }}
            id="freeze-slot-btn"
          >
            <Snowflake size={16} />
            Freeze a Slot
          </button>
        </div>
      </div>

      {/* Alerts */}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-lg)' }}>
          <CheckCircle size={16} /> {success}
        </div>
      )}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-lg)' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Info banner */}
      <div className="alert alert-info" style={{ marginBottom: 'var(--space-xl)' }}>
        <Snowflake size={16} style={{ flexShrink: 0 }} />
        <span>
          Frozen slots are <strong>invisible to online customers</strong> (shown as unavailable) but are not
          charged. Use this when a walk-in customer is already seated or you want to reserve a station in advance.
        </span>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          id="freeze-date-filter"
          type="date"
          className="form-input"
          style={{ width: 'auto' }}
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          placeholder="Filter by date"
        />
        <select
          id="freeze-station-filter"
          className="form-input"
          style={{ width: 'auto' }}
          value={filterStation}
          onChange={(e) => setFilterStation(e.target.value)}
        >
          <option value="">All Stations</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {(filterDate || filterStation) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterDate(''); setFilterStation(''); }}>
            Clear
          </button>
        )}
      </div>

      {/* Frozen slots list */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          Loading frozen slots...
        </div>
      ) : frozenSlots.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon" style={{ color: '#00d4ff' }}>
              <Snowflake size={32} />
            </div>
            <div className="empty-state-title">No Frozen Slots</div>
            <p className="empty-state-text">
              No slots are currently frozen. Use the button above to block a slot for a walk-in customer.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          {Object.entries(groupedByDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, slots]) => (
              <div key={date}>
                {/* Date header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    marginBottom: 'var(--space-md)',
                  }}
                >
                  <Calendar size={15} style={{ color: '#00d4ff' }} />
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {formatDate(date)}
                  </span>
                  {date === today && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: 'rgba(0,212,255,0.1)',
                        color: '#00d4ff',
                        border: '1px solid rgba(0,212,255,0.3)',
                      }}
                    >
                      TODAY
                    </span>
                  )}
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    · {slots.length} frozen slot{slots.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Slot cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                  {slots
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map((slot) => (
                      <div
                        key={slot.id}
                        className="card"
                        style={{
                          padding: 'var(--space-md) var(--space-lg)',
                          borderColor: 'rgba(0,212,255,0.2)',
                          background: 'rgba(0,212,255,0.03)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 'var(--space-md)',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
                          {/* Frozen badge */}
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '4px 10px',
                              borderRadius: '999px',
                              background: 'rgba(0,212,255,0.1)',
                              color: '#00d4ff',
                              border: '1px solid rgba(0,212,255,0.3)',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            <Snowflake size={10} /> Frozen
                          </span>

                          {/* Station */}
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                            <Monitor size={14} style={{ color: 'var(--color-accent-primary)' }} />
                            {slot.station.name}
                          </span>

                          {/* Time */}
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                            <Clock size={14} style={{ color: 'var(--color-accent-primary)' }} />
                            {formatTime(slot.startTime)} — {formatTime(slot.endTime)}
                            <span style={{ color: 'var(--color-text-muted)' }}>
                              ({slot.duration}h)
                            </span>
                          </span>

                          {/* Reason */}
                          {slot.notes && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                              {slot.notes.replace('[Walk-in] ', '')}
                            </span>
                          )}
                        </div>

                        {/* Unfreeze button */}
                        <button
                          className="btn btn-sm"
                          style={{
                            background: 'rgba(255,64,64,0.1)',
                            color: 'var(--color-accent-danger)',
                            border: '1px solid rgba(255,64,64,0.25)',
                          }}
                          onClick={() => handleUnfreeze(slot.id)}
                          disabled={deletingId === slot.id}
                          id={`unfreeze-${slot.id}`}
                        >
                          <Trash2 size={13} />
                          {deletingId === slot.id ? 'Unfreezing...' : 'Unfreeze'}
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ── Freeze Form Modal ── */}
      {showForm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'var(--space-xl)',
          }}
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="card" style={{ width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                <Snowflake size={20} style={{ display: 'inline', marginRight: 8, color: '#00d4ff' }} />
                Freeze a Slot
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)' }}>
                <AlertCircle size={15} /> {error}
              </div>
            )}

            <form onSubmit={handleFreeze} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {/* Station */}
              <div className="form-group">
                <label className="form-label" htmlFor="freeze-station">Station *</label>
                <select
                  id="freeze-station"
                  className="form-input"
                  value={form.stationId}
                  onChange={(e) => setForm({ ...form, stationId: e.target.value })}
                  required
                >
                  <option value="">Select a station...</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div className="form-group">
                <label className="form-label" htmlFor="freeze-date">Date *</label>
                <input
                  id="freeze-date"
                  type="date"
                  className="form-input"
                  value={form.date}
                  min={today}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>

              {/* Start time + Duration in 2 cols */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="freeze-start">Start Time *</label>
                  <select
                    id="freeze-start"
                    className="form-input"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    required
                  >
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>{formatTime(t)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="freeze-duration">Duration *</label>
                  <select
                    id="freeze-duration"
                    className="form-input"
                    value={form.duration}
                    onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
                  >
                    {DURATION_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d} hour{d > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Reason */}
              <div className="form-group">
                <label className="form-label" htmlFor="freeze-reason">
                  Reason <span style={{ color: 'var(--color-text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <input
                  id="freeze-reason"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Walk-in customer Rahul, Tournament block, Maintenance..."
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </div>

              {/* Summary preview */}
              {form.stationId && form.date && form.startTime && (
                <div
                  style={{
                    padding: 'var(--space-md)',
                    background: 'rgba(0,212,255,0.06)',
                    border: '1px solid rgba(0,212,255,0.2)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.875rem',
                  }}
                >
                  <Snowflake size={13} style={{ display: 'inline', marginRight: 6, color: '#00d4ff' }} />
                  Will freeze{' '}
                  <strong>{stations.find((s) => s.id === form.stationId)?.name}</strong>{' '}
                  on <strong>{formatDate(form.date)}</strong>{' '}
                  from <strong>{formatTime(form.startTime)}</strong> for{' '}
                  <strong>{form.duration} hour{form.duration > 1 ? 's' : ''}</strong>.
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={submitting || !form.stationId}
                  id="freeze-submit-btn"
                >
                  <Snowflake size={16} />
                  {submitting ? 'Freezing...' : 'Freeze Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
