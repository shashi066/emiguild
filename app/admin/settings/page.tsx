'use client';

import { useEffect, useState } from 'react';
import {
  Settings, Save, CheckCircle, AlertCircle,
  Gamepad2, RefreshCw, Clock, Edit2, X, Monitor, Package, Bot, Search,
} from 'lucide-react';
import {
  SPECIAL_OPENING_DATE_KEY,
  SPECIAL_OPENING_ENABLED_KEY,
  SPECIAL_OPENING_TIME_KEY,
  formatPublicTimeLabel,
  getActiveSpecialOpening,
  getIndiaClock,
} from '@/lib/public-booking-time';
import { parsePs5RentalPrice, resolvePs5RentalAvailability } from '@/lib/ps5-rental';
import { AssistantAISettings } from '@/components/admin/AssistantAISettings';

type Setting = { id: string; key: string; value: string; label: string | null };
type ModalId  = 'controller_price' | 'venue_capacity' | 'opening_boost' | 'stations_availability' | 'ps5_rental_status' | 'ps5_rental_price' | 'ps5_rental_controller' | 'assistant' | null;
type SettingsCategory = 'all' | 'venue' | 'rentals' | 'assistant';
const SETTINGS_TABS: Array<{ id: SettingsCategory; label: string }> = [
  { id: 'all', label: 'All settings' }, { id: 'venue', label: 'Venue & Booking' },
  { id: 'rentals', label: 'PS5 Rentals' }, { id: 'assistant', label: 'Emiily AI' },
];

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Modal
  const [modalId, setModalId] = useState<ModalId>(null);
  const [draft,   setDraft]   = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);
  const [category, setCategory] = useState<SettingsCategory>('all');
  const [search, setSearch] = useState('');

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
      (data.settings as Setting[]).forEach((s) => { map[s.key] = s.key === 'assistant_release_mode' && s.value === 'BETA' ? 'ON' : s.value; });
      setSettings(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openModal = (id: ModalId) => {
    const indiaClock = getIndiaClock();
    const nextDraft = { ...settings };

    if (id === 'opening_boost' && nextDraft[SPECIAL_OPENING_DATE_KEY] !== indiaClock.date) {
      nextDraft[SPECIAL_OPENING_ENABLED_KEY] = 'false';
      nextDraft[SPECIAL_OPENING_DATE_KEY] = indiaClock.date;
    }

    setDraft(nextDraft);   // seed draft with current saved values
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
  const specialStoredDate  = settings[SPECIAL_OPENING_DATE_KEY];
  const specialStoredEnabled = settings[SPECIAL_OPENING_ENABLED_KEY] === 'true';
  const specialEnabled     = specialStoredEnabled && specialStoredDate === indiaClock.date;
  const specialTime        = settings[SPECIAL_OPENING_TIME_KEY]    ?? '11:00';
  const activeSpecial      = getActiveSpecialOpening(
    {
      [SPECIAL_OPENING_ENABLED_KEY]: specialEnabled,
      [SPECIAL_OPENING_DATE_KEY]:    specialStoredDate,
      [SPECIAL_OPENING_TIME_KEY]:    specialTime,
    },
    indiaClock.date,
  );
  const showStationsAvailability = settings['show_stations_availability'] !== 'false';
  const ps5RentalStatus           = resolvePs5RentalAvailability(settings);
  const ps5RentalPrice            = settings['ps5_rental_price_per_day']     ?? '1200';
  const ps5ExtraControllerPrice   = settings['ps5_rental_extra_controller']  ?? '500';
  const assistantReleaseMode      = settings['assistant_release_mode'] ?? 'OFF';
  const normalizedSearch = search.trim().toLowerCase();
  const visible = (group: Exclude<SettingsCategory, 'all'>, terms: string) =>
    (category === 'all' || category === group) && (!normalizedSearch || terms.toLowerCase().includes(normalizedSearch));
  const visibleCount = [
    ['venue', 'extra controller price booking charge'], ['venue', 'venue capacity simultaneous booking screens'],
    ['venue', 'early opening hours override'], ['venue', 'live station availability homepage'],
    ['rentals', 'ps5 rental service status'], ['rentals', 'ps5 rental daily price'], ['rentals', 'ps5 extra controller price per day'],
    ['assistant', 'emiily ai api key model daily request limit'], ['assistant', 'emi assistant release mode on off'],
  ].filter(([group, terms]) => visible(group as Exclude<SettingsCategory, 'all'>, terms)).length;

  // Draft variants (inside modal)
  const draftSpecialDate    = draft[SPECIAL_OPENING_DATE_KEY];
  const draftSpecialEnabled = draft[SPECIAL_OPENING_ENABLED_KEY] === 'true'
    && draftSpecialDate === indiaClock.date;
  const draftSpecialTime    = draft[SPECIAL_OPENING_TIME_KEY]    ?? '11:00';
  const draftActiveSpecial  = getActiveSpecialOpening(
    {
      [SPECIAL_OPENING_ENABLED_KEY]: draftSpecialEnabled,
      [SPECIAL_OPENING_DATE_KEY]:    draftSpecialDate,
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

  const saveStationsAvailability = () =>
    persist([{ key: 'show_stations_availability', value: draft['show_stations_availability'] ?? 'true', label: 'User Live Station Availability' }]);

  const savePs5RentalStatus = () =>
    persist([{ key: 'ps5_rental_status', value: draft['ps5_rental_status'] ?? ps5RentalStatus, label: 'PS5 Rental Service Status' }]);

  const savePs5RentalPrice = () => {
    const value = parsePs5RentalPrice(draft['ps5_rental_price_per_day'], -1);
    if (value < 0) return showToast('error', 'Enter a whole-number price between ₹0 and ₹100,000.');
    return persist([{ key: 'ps5_rental_price_per_day', value: String(value), label: 'PS5 Rental Price Per Day' }]);
  };

  const savePs5RentalController = () => {
    const value = parsePs5RentalPrice(draft['ps5_rental_extra_controller'], -1);
    if (value < 0) return showToast('error', 'Enter a whole-number price between ₹0 and ₹100,000.');
    return persist([{ key: 'ps5_rental_extra_controller', value: String(value), label: 'PS5 Rental Extra Controller Price Per Day' }]);
  };

  const saveAssistant = () => persist([
    { key: 'assistant_release_mode', value: draft['assistant_release_mode'] ?? 'OFF', label: 'Emi Assistant Release Mode' },
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
        <div className="admin-settings-shell">
          <div className="admin-settings-toolbar">
            <div className="admin-settings-search"><Search size={17} aria-hidden="true" /><input aria-label="Search settings" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search settings…" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Clear settings search"><X size={15} /></button>}</div>
            <div className="admin-settings-tabs" role="tablist" aria-label="Settings categories">{SETTINGS_TABS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={category === tab.id} className={category === tab.id ? 'active' : ''} onClick={() => setCategory(tab.id)}>{tab.label}</button>)}</div>
          </div>
          <div className="admin-settings-result-count">{visibleCount} setting{visibleCount === 1 ? '' : 's'}</div>
          <div className="admin-settings-grid">
          {visible('assistant', 'emiily ai api key model daily request limit') && <AssistantAISettings />}

          {/* ── Controller Price ── */}
          {visible('venue', 'extra controller price booking charge') && <SettingCard
            icon={<Gamepad2 size={20} />}
            title="Extra Controller Price"
            description="Charge per extra controller per booking. 1 controller is always included free."
            value={`₹${controllerPrice} / controller`}
            onEdit={() => openModal('controller_price')}
          />}

          {/* ── Venue Capacity ── */}
          {visible('venue', 'venue capacity simultaneous booking screens') && <SettingCard
            icon={<Monitor size={20} />}
            title="Venue Capacity"
            description="Max concurrent bookings allowed at the same time (limited by number of TVs / screens)."
            value={`${venueCapacity} simultaneous booking${parseInt(venueCapacity) === 1 ? '' : 's'}`}
            onEdit={() => openModal('venue_capacity')}
          />}

          {/* ── Early Hours Override ── */}
          {visible('venue', 'early opening hours override') && <SettingCard
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
          />}

          {/* ── Show Stations Availability ── */}
          {visible('venue', 'live station availability homepage') && <SettingCard
            icon={<Monitor size={20} />}
            title="User Live Station Availability"
            description="Enable or disable showing the Live Station Availability timeline block on the user home page."
            value={showStationsAvailability ? 'Enabled — Visible to users' : 'Disabled — Hidden from users'}
            badge={showStationsAvailability ? 'active' : undefined}
            onEdit={() => openModal('stations_availability')}
          />}

          {/* ── PS5 Rental Enabled ── */}
          {visible('rentals', 'ps5 rental service status') && <SettingCard
            icon={<Package size={20} />}
            title="PS5 Rental Service"
            description="Enable or disable the PS5 home rental service for users."
            value={ps5RentalStatus === 'AVAILABLE' ? 'Available — Accepting orders' : ps5RentalStatus === 'COMING_SOON' ? 'Coming Soon — Visible, not accepting orders' : 'Disabled — Hidden from homepage'}
            badge={ps5RentalStatus === 'AVAILABLE' ? 'active' : undefined}
            onEdit={() => openModal('ps5_rental_status')}
          />}

          {/* ── PS5 Rental Price ── */}
          {visible('rentals', 'ps5 rental daily price') && <SettingCard
            icon={<Package size={20} />}
            title="PS5 Rental Price (Per Day)"
            description="Daily rental price for PS5 console with 1 controller included."
            value={`₹${ps5RentalPrice} / day`}
            onEdit={() => openModal('ps5_rental_price')}
          />}

          {/* ── PS5 Extra Controller Price ── */}
          {visible('rentals', 'ps5 extra controller price per day') && <SettingCard
            icon={<Gamepad2 size={20} />}
            title="PS5 Extra Controller (Per Day)"
            description="Additional charge per extra controller per day of rental."
            value={`₹${ps5ExtraControllerPrice} / controller / day`}
            onEdit={() => openModal('ps5_rental_controller')}
          />}

          {visible('assistant', 'emi assistant release mode on off') && <SettingCard
            icon={<Bot size={20} />}
            title="Emi Assistant"
            description="Enable Emiily for all visitors. AI chat requires sign-in. Emiily is still in beta."
            value={assistantReleaseMode === 'ON' ? 'On — all visitors' : 'Off'}
            badge={assistantReleaseMode === 'ON' ? 'active' : undefined}
            onEdit={() => openModal('assistant')}
          />}
          {!visibleCount && <div className="admin-settings-empty"><Search size={26} /><strong>No matching settings</strong><span>Try another search or choose a different category.</span><button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setCategory('all'); }}>Clear filters</button></div>}
          </div>
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
                  className="form-input"
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

      {/* ══ Modal: User Live Station Availability ════════════════════════════════ */}
      {modalId === 'stations_availability' && (
        <Modal
          title="User Live Station Availability"
          icon={<Monitor size={18} />}
          onClose={closeModal}
          onSave={saveStationsAvailability}
          saving={saving}
        >
          <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.02)', padding: '12px var(--space-md)',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
            }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Show Timeline on Home Page</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  Visible to public customers on home page
                </div>
              </div>
              <label style={{ cursor: 'pointer', display: 'inline-block' }}>
                <input
                  type="checkbox"
                  checked={draft['show_stations_availability'] !== 'false'}
                  onChange={(e) => setDraft((p) => ({ ...p, show_stations_availability: e.target.checked ? 'true' : 'false' }))}
                  style={{ display: 'none' }}
                />
                <div style={{
                  width: 44, height: 22,
                  background: draft['show_stations_availability'] !== 'false' ? 'var(--color-accent-success)' : 'rgba(255,255,255,0.1)',
                  borderRadius: 99, position: 'relative', transition: 'background 0.2s',
                }}>
                  <div style={{
                    width: 16, height: 16, background: '#fff', borderRadius: '50%',
                    position: 'absolute', top: 3,
                    left: draft['show_stations_availability'] !== 'false' ? 25 : 3,
                    transition: 'left 0.2s',
                  }} />
                </div>
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Modal: PS5 Rental Enabled ══════════════════════════════════════════ */}
      {modalId === 'ps5_rental_status' && (
        <Modal
          title="PS5 Rental Service"
          icon={<Package size={18} />}
          onClose={closeModal}
          onSave={savePs5RentalStatus}
          saving={saving}
        >
          <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="modal-ps5-status">Public availability</label>
              <select id="modal-ps5-status" className="form-input" value={draft['ps5_rental_status'] ?? ps5RentalStatus} onChange={(e) => setDraft((p) => ({ ...p, ps5_rental_status: e.target.value }))}>
                <option value="AVAILABLE">Available — accept orders</option>
                <option value="COMING_SOON">Coming Soon — show announcement</option>
                <option value="DISABLED">Disabled — hide from homepage</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Modal: PS5 Rental Price ═══════════════════════════════════════════ */}
      {modalId === 'ps5_rental_price' && (
        <Modal
          title="PS5 Rental Price (Per Day)"
          icon={<Package size={18} />}
          onClose={closeModal}
          onSave={savePs5RentalPrice}
          saving={saving}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="modal-ps5-price">Price per day (PS5 + 1 controller)</label>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
              This is the daily rental charge for the PS5 console with 1 DualSense controller included.
            </p>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{
                position: 'absolute', left: 14,
                fontFamily: 'Orbitron, sans-serif', fontWeight: 700,
                color: 'var(--color-accent-primary)', fontSize: '0.95rem',
              }}>₹</span>
              <input
                id="modal-ps5-price"
                type="number"
                className="form-input"
                style={{ paddingLeft: 34, paddingRight: 70 }}
                value={draft['ps5_rental_price_per_day'] ?? '1200'}
                min={0}
                max={99999}
                onChange={(e) => setDraft((p) => ({ ...p, ps5_rental_price_per_day: e.target.value }))}
              />
              <span style={{ position: 'absolute', right: 14, fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                / day
              </span>
            </div>
            <div style={{
              marginTop: 10, padding: '10px 14px',
              background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.15)',
              borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--color-text-secondary)',
            }}>
              Preview: 7-day rental = {' '}
              <strong style={{ color: 'var(--color-accent-primary)' }}>
                ₹{(parseFloat(draft['ps5_rental_price_per_day'] ?? '1200') * 7).toFixed(0)}
              </strong>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Modal: PS5 Extra Controller Price ═════════════════════════════════ */}
      {modalId === 'ps5_rental_controller' && (
        <Modal
          title="PS5 Extra Controller (Per Day)"
          icon={<Gamepad2 size={18} />}
          onClose={closeModal}
          onSave={savePs5RentalController}
          saving={saving}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="modal-ps5-controller">Price per extra controller per day</label>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
              1 controller is always included free. This is the charge per additional controller per day.
            </p>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{
                position: 'absolute', left: 14,
                fontFamily: 'Orbitron, sans-serif', fontWeight: 700,
                color: 'var(--color-accent-primary)', fontSize: '0.95rem',
              }}>₹</span>
              <input
                id="modal-ps5-controller"
                type="number"
                className="form-input"
                style={{ paddingLeft: 34, paddingRight: 130 }}
                value={draft['ps5_rental_extra_controller'] ?? '500'}
                min={0}
                max={99999}
                onChange={(e) => setDraft((p) => ({ ...p, ps5_rental_extra_controller: e.target.value }))}
              />
              <span style={{ position: 'absolute', right: 14, fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                / controller / day
              </span>
            </div>
            <div style={{
              marginTop: 10, padding: '10px 14px',
              background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.15)',
              borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--color-text-secondary)',
            }}>
              Preview: 2 extra controllers × 5 days = {' '}
              <strong style={{ color: 'var(--color-accent-primary)' }}>
                ₹{(parseFloat(draft['ps5_rental_extra_controller'] ?? '500') * 2 * 5).toFixed(0)}
              </strong>
            </div>
          </div>
        </Modal>
      )}

      {modalId === 'assistant' && (
        <Modal
          title="Emi Assistant"
          icon={<Bot size={18} />}
          onClose={closeModal}
          onSave={saveAssistant}
          saving={saving}
        >
          <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="modal-assistant-mode">Release mode</label>
              <select id="modal-assistant-mode" className="form-input" value={draft['assistant_release_mode'] ?? 'OFF'} onChange={(e) => setDraft((p) => ({ ...p, assistant_release_mode: e.target.value }))}>
                <option value="OFF">Off — hidden for everyone</option>
                <option value="ON">On — all visitors (AI still requires sign-in)</option>
              </select>
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
    <div className="card admin-setting-card">
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
