'use client';

import { useEffect, useState } from 'react';
import {
  Settings, Save, CheckCircle, AlertCircle,
  Gamepad2, IndianRupee, RefreshCw, Clock,
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

// Settings config — add new settings here in future
const SETTING_DEFS: { key: string; label: string; description: string; icon: React.ReactNode; prefix?: string; suffix?: string; min?: number; max?: number }[] = [
  {
    key: 'controller_price',
    label: 'Extra Controller Price',
    description: 'Charge per extra controller per booking. 1 controller is always included free.',
    icon: <Gamepad2 size={18} />,
    prefix: '₹',
    suffix: '/ controller',
    min: 0,
    max: 9999,
  },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      const map: Record<string, string> = {};
      (data.settings as Setting[]).forEach((s) => { map[s.key] = s.value; });
      setSettings(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const payload = [
        ...SETTING_DEFS.map((d) => ({
          key:   d.key,
          value: settings[d.key] ?? '0',
          label: d.label,
        })),
        {
          key: SPECIAL_OPENING_ENABLED_KEY,
          value: settings[SPECIAL_OPENING_ENABLED_KEY] === 'true' ? 'true' : 'false',
          label: 'Today Opening Boost',
        },
        {
          key: SPECIAL_OPENING_DATE_KEY,
          value: getIndiaClock().date,
          label: 'Opening Boost Date',
        },
        {
          key: SPECIAL_OPENING_TIME_KEY,
          value: settings[SPECIAL_OPENING_TIME_KEY] ?? '11:00',
          label: 'Opening Boost Time',
        },
      ];
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Save failed.');
        return;
      }
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const indiaClock = getIndiaClock();
  const specialEnabled = settings[SPECIAL_OPENING_ENABLED_KEY] === 'true';
  const specialDate = indiaClock.date;
  const specialTime = settings[SPECIAL_OPENING_TIME_KEY] ?? '11:00';
  const activeSpecialOpening = getActiveSpecialOpening(
    {
      [SPECIAL_OPENING_ENABLED_KEY]: specialEnabled,
      [SPECIAL_OPENING_DATE_KEY]: specialDate,
      [SPECIAL_OPENING_TIME_KEY]: specialTime,
    },
    indiaClock.date,
  );
  const specialPreview = specialEnabled
    ? activeSpecialOpening
      ? `Early access starts at ${formatPublicTimeLabel(activeSpecialOpening.opensAt)} today.`
      : 'Choose a valid 30-minute time earlier than normal opening.'
    : 'Normal public opening hours remain active.';

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Settings size={26} style={{ display: 'inline', marginRight: 10, color: 'var(--color-accent-primary)' }} />
            Settings
          </h1>
          <p className="page-subtitle">Manage pricing and cafe configuration</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-ghost btn-sm" onClick={load} id="refresh-settings-btn">
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading} id="save-settings-btn">
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
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

      {loading ? (
        <div className="loading-state"><div className="spinner" />Loading settings...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', maxWidth: 640 }}>
          {/* Pricing section */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 'var(--space-xl)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <IndianRupee size={18} style={{ color: 'var(--color-accent-success)' }} />
              Pricing Configuration
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
              {SETTING_DEFS.map((def) => (
                <div key={def.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ color: 'var(--color-accent-primary)' }}>{def.icon}</span>
                    <label className="form-label" htmlFor={`setting-${def.key}`} style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                      {def.label}
                    </label>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
                    {def.description}
                  </p>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    {def.prefix && (
                      <span style={{
                        position: 'absolute', left: 14,
                        fontFamily: 'Orbitron, sans-serif', fontWeight: 700,
                        color: 'var(--color-accent-primary)', fontSize: '0.95rem',
                      }}>
                        {def.prefix}
                      </span>
                    )}
                    <input
                      id={`setting-${def.key}`}
                      type="number"
                      className="form-input"
                      style={{ paddingLeft: def.prefix ? 34 : 16, paddingRight: def.suffix ? 150 : 16 }}
                      value={settings[def.key] ?? '0'}
                      min={def.min ?? 0}
                      max={def.max ?? 99999}
                      onChange={(e) => setSettings((prev) => ({ ...prev, [def.key]: e.target.value }))}
                    />
                    {def.suffix && (
                      <span style={{
                        position: 'absolute', right: 14,
                        fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap',
                      }}>
                        {def.suffix}
                      </span>
                    )}
                  </div>

                  {/* Live preview */}
                  <div style={{
                    marginTop: 'var(--space-sm)',
                    padding: '10px 14px',
                    background: 'rgba(108,99,255,0.05)',
                    border: '1px solid rgba(108,99,255,0.15)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.82rem',
                    color: 'var(--color-text-secondary)',
                  }}>
                    Preview: 1 extra controller = <strong style={{ color: 'var(--color-accent-primary)' }}>
                      ₹{parseFloat(settings[def.key] ?? '0').toFixed(0)}
                    </strong> · 3 extra controllers = <strong style={{ color: 'var(--color-accent-primary)' }}>
                      ₹{(parseFloat(settings[def.key] ?? '0') * 3).toFixed(0)}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 'var(--space-xl)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} style={{ color: 'var(--color-accent-primary)' }} />
              Today Opening Boost
            </h2>

            <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minHeight: 44,
                color: 'var(--color-text-secondary)',
                fontWeight: 700,
              }}>
                <input
                  type="checkbox"
                  checked={specialEnabled}
                  onChange={(e) => setSettings((prev) => ({
                    ...prev,
                    [SPECIAL_OPENING_ENABLED_KEY]: e.target.checked ? 'true' : 'false',
                    [SPECIAL_OPENING_DATE_KEY]: indiaClock.date,
                    [SPECIAL_OPENING_TIME_KEY]: prev[SPECIAL_OPENING_TIME_KEY] ?? '11:00',
                  }))}
                  style={{ width: 18, height: 18 }}
                />
                Open earlier than usual today
              </label>

              <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                <div>
                  <label className="form-label" htmlFor="special-opening-time" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={14} />
                    Opens From
                  </label>
                  <input
                    id="special-opening-time"
                    type="time"
                    className="form-input"
                    step={1800}
                    value={specialTime}
                    onChange={(e) => setSettings((prev) => ({
                      ...prev,
                      [SPECIAL_OPENING_TIME_KEY]: e.target.value,
                    }))}
                  />
                </div>
              </div>

              <div className={specialEnabled && activeSpecialOpening ? 'alert alert-success' : 'alert alert-info'}>
                <Clock size={16} style={{ flexShrink: 0 }} />
                <span>{specialPreview}</span>
              </div>
            </div>
          </div>

          {/* Info card */}
          <div className="alert alert-info">
            <Gamepad2 size={16} style={{ flexShrink: 0 }} />
            <span>
              Controller pricing applies to all new bookings instantly. Existing bookings are not affected.
              Set to <strong>₹0</strong> to make extra controllers free for all customers.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
