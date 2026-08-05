'use client';

import { useEffect, useState } from 'react';
import {
  Settings, Save, CheckCircle, AlertCircle,
  Gamepad2, RefreshCw, Clock, Edit2, X, Monitor,
} from 'lucide-react';
import {
  SPECIAL_OPENING_DATE_KEY,
  SPECIAL_OPENING_ENABLED_KEY,
  SPECIAL_OPENING_TIME_KEY,
  formatPublicTimeLabel,
  getActiveSpecialOpening,
  getIndiaClock,
} from '@/lib/public-booking-time';

type Setting = { id: string; key: string; value: string; label: string | null };
type ModalId  = 'controller_price' | 'venue_capacity' | 'opening_boost' | null;

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Modal
  const [modalId, setModalId] = useState<ModalId>(null);
  const [draft,   setDraft]   = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/admin/settings');
      const data = await res.json();
      const map: Record<string, string> = {};
      (data.settings as Setting[]).forEach((s) => { map[s.key] = s.value; });
      setSettings(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openModal = (id: ModalId) => {
    setDraft({ ...settings });   // seed draft with current saved values
    setModalId(id);
  };

  const closeModal = () => { setModalId(null); setDraft({}); };

  const persist = async (payload: { key: string; value: string; label: string }[]) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast('error', data.error ?? 'Save failed.');
        return;
      }
      setSettings((prev) => {
        const next = { ...prev };
        payload.forEach((p) => { next[p.key] = p.value; });
        return next;
      });
      closeModal();
      showToast('success', 'Settings saved!');
    } catch {
      showToast('error', 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const indiaClock         = getIndiaClock();
  const controllerPrice    = settings['controller_price'] ?? '0';
  const venueCapacity      = settings['venue_capacity']   ?? '2';
  const specialEnabled     = settings[SPECIAL_OPENING_ENABLED_KEY] === 'true';
  const specialTime        = settings[SPECIAL_OPENING_TIME_KEY]    ?? '11:00';
  const activeSpecial      = getActiveSpecialOpening(
    {
      [SPECIAL_OPENING_ENABLED_KEY]: specialEnabled,
      [SPECIAL_OPENING_DATE_KEY]:    indiaClock.date,
      [SPECIAL_OPENING_TIME_KEY]:    specialTime,
    },
    indiaClock.date,
  );

  // Draft variants (inside modal)
  const draftSpecialEnabled = draft[SPECIAL_OPENING_ENABLED_KEY] === 'true';
  const draftSpecialTime    = draft[SPECIAL_OPENING_TIME_KEY]    ?? '11:00';
  const draftActiveSpecial  = getActiveSpecialOpening(
    {
      [SPECIAL_OPENING_ENABLED_KEY]: draftSpecialEnabled,
      [SPECIAL_OPENING_DATE_KEY]:    indiaClock.date,
      [SPECIAL_OPENING_TIME_KEY]:    draftSpecialTime,
    },
    indiaClock.date,
  );

  // ── Save handlers ──────────────────────────────────────────────────────────
  const saveControllerPrice = () =>
    persist([{ key: 'controller_price', value: draft['controller_price'] ?? '0', label: 'Extra Controller Price' }]);

  const saveVenueCapacity = () =>
    persist([{ key: 'venue_capacity', value: draft['venue_capacity'] ?? '2', label: 'Max Concurrent Bookings (Venue Capacity)' }]);

  const saveOpeningBoost = () =>
    persist([
      { key: SPECIAL_OPENING_ENABLED_KEY, value: draftSpecialEnabled ? 'true' : 'false', label: 'Early Hours Override' },
      { key: SPECIAL_OPENING_DATE_KEY,    value: indiaClock.date,                         label: 'Early Hours Override Date' },
      { key: SPECIAL_OPENING_TIME_KEY,    value: draftSpecialTime,                         label: 'Early Hours Override Time' },
    ]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Settings size={26} style={{ display: 'inline', marginRight: 10, color: 'var(--color-accent-primary)' }} />
            Settings
          </h1>
          <p className="page-subtitle">Manage pricing and cafe configuration</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} id="refresh-settings-btn">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={`alert ${toast.type === 'success' ? 'alert-success' : 'alert-error'}`}
          style={{ marginBottom: 'var(--space-lg)' }}
        >
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="loading-state"><div className="spinner" />Loading settings…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', maxWidth: 680 }}>

          {/* ── Controller Price ── */}
          <SettingCard
            icon={<Gamepad2 size={20} />}
            title="Extra Controller Price"
            description="Charge per extra controller per booking. 1 controller is always included free."
            value={`₹${controllerPrice} / controller`}
            onEdit={() => openModal('controller_price')}
          />

          {/* ── Venue Capacity ── */}
          <SettingCard
            icon={<Monitor size={20} />}
            title="Venue Capacity"
            description="Max concurrent bookings allowed at the same time (limited by number of TVs / screens)."
            value={`${venueCapacity} simultaneous booking${parseInt(venueCapacity) === 1 ? '' : 's'}`}
            onEdit={() => openModal('venue_capacity')}
          />

          {/* ── Early Hours Override ── */}
          <SettingCard
            icon={<Clock size={20} />}
            title="Early Hours Override"
            description="Temporarily open the venue earlier than normal hours for today only."
            value={
              specialEnabled && activeSpecial
                ? `Active — opens at ${formatPublicTimeLabel(activeSpecial.opensAt)}`
                : specialEnabled
                ? 'Enabled (pick a valid time before normal opening)'
                : 'Disabled — normal hours active'
            }
            badge={
              specialEnabled && activeSpecial ? 'active'
              : specialEnabled                 ? 'warning'
              : undefined
            }
            onEdit={() => openModal('opening_boost')}
          />

        </div>
      )}

      {/* ══ Modal: Controller Price ══════════════════════════════════════════════ */}
      {modalId === 'controller_price' && (
        <Modal
          title="Extra Controller Price"
          icon={<Gamepad2 size={18} />}
          onClose={closeModal}
          onSave={saveControllerPrice}
          saving={saving}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="modal-controller-price">
              Price per extra controller
            </label>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
              Charged per controller beyond the first for each booking session.
            </p>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{
                position: 'absolute', left: 14,
                fontFamily: 'Orbitron, sans-serif', fontWeight: 700,
                color: 'var(--color-accent-primary)', fontSize: '0.95rem',
              }}>₹</span>
              <input
                id="modal-controller-price"
                type="number"
                className="form-input"
                style={{ paddingLeft: 34, paddingRight: 120 }}
                value={draft['controller_price'] ?? '0'}
                min={0}
                max={9999}
                onChange={(e) => setDraft((p) => ({ ...p, controller_price: e.target.value }))}
              />
              <span style={{ position: 'absolute', right: 14, fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                / controller
              </span>
            </div>
            <div style={{
              marginTop: 10, padding: '10px 14px',
              background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.15)',
              borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--color-text-secondary)',
            }}>
              Preview: 3 extra controllers = {' '}
              <strong style={{ color: 'var(--color-accent-primary)' }}>
                ₹{(parseFloat(draft['controller_price'] ?? '0') * 3).toFixed(0)}
              </strong>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Modal: Venue Capacity ════════════════════════════════════════════════ */}
      {modalId === 'venue_capacity' && (
        <Modal
          title="Venue Capacity"
          icon={<Monitor size={18} />}
          onClose={closeModal}
          onSave={saveVenueCapacity}
          saving={saving}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="modal-venue-capacity">
              Max concurrent bookings
            </label>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
              How many sessions can run simultaneously (e.g. number of TVs available).
              When this limit is reached, all station slots for that time are blocked.
            </p>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="modal-venue-capacity"
                type="number"
                className="form-input"
                style={{ paddingRight: 110 }}
                value={draft['venue_capacity'] ?? '2'}
                min={1}
                max={100}
                onChange={(e) => setDraft((p) => ({ ...p, venue_capacity: e.target.value }))}
              />
              <span style={{ position: 'absolute', right: 14, fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                bookings
              </span>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Modal: Early Hours Override ══════════════════════════════════════ */}
      {modalId === 'opening_boost' && (
        <Modal
          title="Early Hours Override"
          icon={<Clock size={18} />}
          onClose={closeModal}
          onSave={saveOpeningBoost}
          saving={saving}
        >
          <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>

            {/* Toggle row */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderRadius: 'var(--radius-md)',
              background: draftSpecialEnabled ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${draftSpecialEnabled ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.1)'}`,
              transition: 'all 0.2s',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                  {draftSpecialEnabled ? '🟢 Early opening enabled' : '⚫ Early opening disabled'}
                </div>
                <div style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {draftSpecialEnabled ? 'Set the time below to open early today' : 'Venue opens at normal hours'}
                </div>
              </div>
              {/* Toggle switch */}
              <button
                type="button"
                id="opening-boost-toggle"
                onClick={() => setDraft((p) => ({
                  ...p,
                  [SPECIAL_OPENING_ENABLED_KEY]: p[SPECIAL_OPENING_ENABLED_KEY] === 'true' ? 'false' : 'true',
                  [SPECIAL_OPENING_DATE_KEY]:    indiaClock.date,
                  [SPECIAL_OPENING_TIME_KEY]:    p[SPECIAL_OPENING_TIME_KEY] ?? '11:00',
                }))}
                style={{
                  width: 48, height: 26, borderRadius: 13, flexShrink: 0,
                  background: draftSpecialEnabled ? '#10b981' : 'rgba(255,255,255,0.15)',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  transition: 'background 0.2s',
                }}
                aria-label="Toggle early opening"
              >
                <span style={{
                  position: 'absolute', top: 3,
                  left: draftSpecialEnabled ? 25 : 3,
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'white',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  transition: 'left 0.2s', display: 'block',
                }} />
              </button>
            </div>

            {/* Time picker — custom select, disabled when toggle is off */}
            <div className="form-group">
              <label
                className="form-label"
                htmlFor="modal-opening-time"
                style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: draftSpecialEnabled ? 1 : 0.4 }}
              >
                <Clock size={14} /> Opens From
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  id="modal-opening-time"
                  disabled={!draftSpecialEnabled}
                  value={draftSpecialTime}
                  onChange={(e) => setDraft((p) => ({ ...p, [SPECIAL_OPENING_TIME_KEY]: e.target.value }))}
                  style={{
                    width: '100%',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    padding: '12px 44px 12px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${draftSpecialEnabled ? 'rgba(108,99,255,0.35)' : 'rgba(255,255,255,0.08)'}`,
                    background: draftSpecialEnabled
                      ? 'rgba(108,99,255,0.06)'
                      : 'rgba(255,255,255,0.03)',
                    color: draftSpecialEnabled ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    fontSize: '0.9rem',
                    fontFamily: 'Orbitron, sans-serif',
                    fontWeight: 600,
                    cursor: draftSpecialEnabled ? 'pointer' : 'not-allowed',
                    outline: 'none',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                >
                  {Array.from({ length: 48 }, (_, i) => {
                    const totalMins = i * 30;                // 00:00 → 23:30
                    const h   = Math.floor(totalMins / 60);
                    const m   = totalMins % 60;
                    const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    const label = `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m === 0 ? '00' : '30'} ${h < 12 ? 'AM' : 'PM'}`;
                    return <option key={val} value={val}>{label}</option>;
                  })}
                </select>
                {/* Custom chevron */}
                <span style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  pointerEvents: 'none', opacity: draftSpecialEnabled ? 0.7 : 0.3,
                  fontSize: '0.7rem', color: 'var(--color-accent-primary)',
                }}>▼</span>
              </div>
              {!draftSpecialEnabled && (
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
                  Enable the toggle above to set an early opening time.
                </p>
              )}
            </div>

            <div className={draftSpecialEnabled && draftActiveSpecial ? 'alert alert-success' : 'alert alert-info'}>
              <Clock size={16} style={{ flexShrink: 0 }} />
              <span>
                {draftSpecialEnabled
                  ? draftActiveSpecial
                    ? `Early access starts at ${formatPublicTimeLabel(draftActiveSpecial.opensAt)} today.`
                    : 'Choose a valid 30-minute time earlier than normal opening.'
                  : 'Normal public opening hours remain active.'}
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── SettingCard ────────────────────────────────────────────────────────────────
function SettingCard({
  icon, title, description, value, badge, onEdit,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: string;
  badge?: 'active' | 'warning';
  onEdit: () => void;
}) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', padding: '20px 24px' }}>
      <span style={{ color: 'var(--color-accent-primary)', flexShrink: 0 }}>{icon}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>{description}</div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize:   '0.88rem',
            fontWeight: 700,
            color:      'var(--color-text-primary)',
            background: 'rgba(108,99,255,0.08)',
            border:     '1px solid rgba(108,99,255,0.2)',
            borderRadius: 6,
            padding:    '3px 10px',
          }}>
            {value}
          </span>
          {badge === 'active' && (
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, color: '#10b981',
              background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 999, padding: '2px 8px',
            }}>Active</span>
          )}
          {badge === 'warning' && (
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b',
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 999, padding: '2px 8px',
            }}>Check time</span>
          )}
        </div>
      </div>

      <button
        className="btn btn-ghost btn-sm"
        onClick={onEdit}
        id={`edit-setting-${title.toLowerCase().replace(/[\s/]+/g, '-')}`}
        style={{ flexShrink: 0 }}
      >
        <Edit2 size={14} /> Edit
      </button>
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function Modal({
  title, icon, children, onClose, onSave, saving,
}: {
  title:    string;
  icon?:    React.ReactNode;
  children: React.ReactNode;
  onClose:  () => void;
  onSave:   () => void;
  saving:   boolean;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-xl)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            {icon && <span style={{ color: 'var(--color-accent-primary)' }}>{icon}</span>}
            {title}
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} id="modal-x-btn" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {children}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-xl)' }}>
          <button
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={onClose}
            disabled={saving}
            id="modal-cancel-btn"
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={onSave}
            disabled={saving}
            id="modal-save-btn"
          >
            <Save size={15} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
