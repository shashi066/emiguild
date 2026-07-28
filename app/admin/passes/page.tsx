'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Search, Award, CheckCircle, AlertCircle, Calendar, User, X, ChevronDown, Ban,
  Crown, Sword, Save, Clock3,
} from 'lucide-react';
import { decryptPhone } from '@/lib/crypto';
import {
  GuildMembershipPlan,
  guildMembershipName,
  isGuildMembershipType,
  normalizeGuildMembershipPlans,
} from '@/lib/guild-membership';

type PassType =
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'BLACK'
  | 'APEX'
  | 'GUILD_HERO'
  | 'GUILD_MASTER';

const HOURS_PASS_OPTIONS: {
  type: PassType;
  icon: string;
  hours: number;
  price: number;
  validityDays: number;
  label: string;
  isActive: boolean;
}[] = [
  { type: 'BRONZE', icon: '🥉', label: 'Bronze Pass', hours: 10, price: 1300, validityDays: 30, isActive: true },
  { type: 'SILVER', icon: '🥈', label: 'Silver Pass', hours: 20, price: 2300, validityDays: 30, isActive: true },
  { type: 'GOLD',   icon: '🥇', label: 'Gold Pass',   hours: 30, price: 3000, validityDays: 30, isActive: true },
  { type: 'BLACK',  icon: '🖤', label: 'Black Pass',  hours: 10, price: 2400, validityDays: 30, isActive: true },
  { type: 'APEX',   icon: '⚡', label: 'Apex Pass',   hours: 15, price: 3150, validityDays: 30, isActive: true },
];

const PASS_COLOR: Record<PassType, string> = {
  BRONZE: '#cd7f32', SILVER: '#c0c0c0', GOLD: '#FFD700',
  BLACK: '#d8dee9', APEX: '#67e8f9',
  GUILD_HERO: '#60a5fa', GUILD_MASTER: '#f4cf58',
};

type UserItem = { id: string; name: string; email: string; phone: string | null };
type ActivePass = {
  id: string; passType: string; totalHours: number;
  usedHours: number; price: number; status: string;
  purchasedAt: string; expiresAt: string;
};

export default function AdminPassesPage() {
  const [allUsers, setAllUsers]           = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers]   = useState(true);
  const [query, setQuery]                 = useState('');
  const [showDropdown, setShowDropdown]   = useState(false);
  const [selectedUser, setSelectedUser]   = useState<UserItem | null>(null);
  const [userPasses, setUserPasses]       = useState<ActivePass[]>([]);
  const [loadingPasses, setLoadingPasses] = useState(false);
  const [selectedPass, setSelectedPass]   = useState<PassType>('SILVER');
  const [assigning, setAssigning]         = useState(false);
  const [revokingPassId, setRevokingPassId] = useState<string | null>(null);
  const [extendingPassId, setExtendingPassId] = useState<string | null>(null);
  const [guildPlans, setGuildPlans] = useState<GuildMembershipPlan[]>(
    () => normalizeGuildMembershipPlans(null)
  );
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const [success, setSuccess]             = useState('');
  const [error, setError]                 = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load all users once
  useEffect(() => {
    fetch('/api/admin/passes/users')
      .then((r) => r.json())
      .then((d) => setAllUsers((d.users ?? []).map((user: any) => ({
        ...user,
        phone: decryptPhone(user.phone),
      }))))
      .catch(() => setAllUsers([]))
      .finally(() => setLoadingUsers(false));
    fetch('/api/admin/passes?plans=1')
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((data) => {
        if (data.plans?.length) setGuildPlans(data.plans);
      })
      .catch(() => {});
  }, []);

  const passOptions = [
    ...HOURS_PASS_OPTIONS,
    ...guildPlans.map((plan) => ({
      type: plan.type as PassType,
      icon: plan.type === 'GUILD_MASTER' ? '👑' : '⚔️',
      label: plan.name,
      hours: 0,
      price: plan.price,
      validityDays: plan.validityDays,
      isActive: plan.isActive,
    })),
  ];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim().length === 0 ? [] : allUsers.filter((u) => {
    const q = query.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone ?? '').includes(q);
  }).slice(0, 8);

  const fetchUserPasses = async (userId: string) => {
    setLoadingPasses(true);
    setUserPasses([]);
    try {
      const res = await fetch(`/api/admin/passes?userId=${userId}&history=1`);
      if (res.ok) {
        const data = await res.json();
        setUserPasses(data.passes ?? []);
      }
    } finally {
      setLoadingPasses(false);
    }
  };

  const handleSelect = (user: UserItem) => {
    setSelectedUser(user);
    setQuery('');
    setShowDropdown(false);
    setSuccess('');
    setError('');
    fetchUserPasses(user.id);
  };

  const handleClear = () => {
    setSelectedUser(null);
    setUserPasses([]);
    setQuery('');
    setSuccess('');
    setError('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleAssign = async () => {
    if (!selectedUser) return;
    setAssigning(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, passType: selectedPass }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to assign pass.');
      } else {
        const cfg = passOptions.find((p) => p.type === selectedPass)!;
        setSuccess(`${cfg.label} assigned to ${selectedUser.name}!`);
        fetchUserPasses(selectedUser.id);
      }
    } catch {
      setError('Failed to assign pass. Please try again.');
    } finally {
      setAssigning(false);
    }
  };

  const handleExtend = async (passId: string) => {
    if (!selectedUser) return;
    setExtendingPassId(passId);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/passes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extend', passId, days: 30 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to extend membership.');
      } else {
        setSuccess(`Membership extended by 30 days for ${selectedUser.name}.`);
        fetchUserPasses(selectedUser.id);
      }
    } catch {
      setError('Failed to extend membership. Please try again.');
    } finally {
      setExtendingPassId(null);
    }
  };

  const updatePlanState = (
    type: string,
    updates: Partial<GuildMembershipPlan>,
  ) => {
    setGuildPlans((current) => current.map((plan) =>
      plan.type === type ? { ...plan, ...updates } : plan
    ));
  };

  const handleSavePlan = async (plan: GuildMembershipPlan) => {
    setSavingPlan(plan.type);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/passes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updatePlan',
          passType: plan.type,
          price: plan.price,
          validityDays: plan.validityDays,
          description: plan.description,
          isActive: plan.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to save membership plan.');
      } else {
        updatePlanState(plan.type, data.plan);
        setSuccess(`${plan.name} settings saved.`);
      }
    } catch {
      setError('Failed to save membership plan. Please try again.');
    } finally {
      setSavingPlan(null);
    }
  };

  const handleRevoke = async (passId: string, passType: string) => {
    if (!selectedUser) return;
    if (!confirm(`Revoke this ${passType} pass for ${selectedUser.name}?`)) return;

    setRevokingPassId(passId);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/passes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to revoke pass.');
      } else {
        setSuccess(`${passType} pass revoked for ${selectedUser.name}.`);
        fetchUserPasses(selectedUser.id);
      }
    } catch {
      setError('Failed to revoke pass. Please try again.');
    } finally {
      setRevokingPassId(null);
    }
  };

  return (
    <>
      <style>{`
        .pass-search-wrapper { position: relative; }

        .pass-search-box {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 14px;
          height: 46px;
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
          cursor: text;
        }
        .pass-search-box:focus-within {
          border-color: var(--color-border-accent);
          box-shadow: 0 0 0 3px rgba(108,99,255,0.12);
        }
        .pass-search-box input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: var(--color-text-primary);
          font-family: inherit;
          font-size: 0.9rem;
          min-width: 0;
        }
        .pass-search-box input::placeholder { color: var(--color-text-muted); }

        .pass-search-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px 4px 8px;
          background: rgba(108,99,255,0.15);
          border: 1px solid rgba(108,99,255,0.3);
          border-radius: var(--radius-full);
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--color-accent-primary);
          white-space: nowrap;
          max-width: 240px;
        }
        .pass-search-chip .chip-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pass-chip-clear {
          background: none;
          border: none;
          cursor: pointer;
          padding: 1px;
          display: flex;
          align-items: center;
          color: var(--color-accent-primary);
          opacity: 0.7;
          flex-shrink: 0;
        }
        .pass-chip-clear:hover { opacity: 1; }

        .pass-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0; right: 0;
          z-index: 100;
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border-accent);
          border-radius: var(--radius-md);
          box-shadow: 0 12px 40px rgba(0,0,0,0.5);
          overflow: hidden;
          animation: dropdownIn 0.12s ease;
        }
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .pass-dropdown-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          width: 100%;
          background: none;
          border: none;
          border-bottom: 1px solid var(--color-border);
          cursor: pointer;
          text-align: left;
          transition: background var(--transition-fast);
        }
        .pass-dropdown-item:last-child { border-bottom: none; }
        .pass-dropdown-item:hover { background: rgba(108,99,255,0.1); }

        .pass-dropdown-avatar {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: var(--gradient-primary);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .pass-dropdown-empty {
          padding: 14px 16px;
          font-size: 0.85rem;
          color: var(--color-text-muted);
          text-align: center;
        }

        .pass-type-btn {
          padding: 16px 12px;
          border-radius: var(--radius-md);
          text-align: center;
          border: 2px solid var(--color-border);
          background: var(--color-bg-card);
          cursor: pointer;
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
        }
        .pass-type-btn:hover { border-color: rgba(255,255,255,0.15); }
        .pass-type-btn.active-bronze { border-color: #cd7f32; background: rgba(205,127,50,0.08); box-shadow: 0 0 16px rgba(205,127,50,0.2); }
        .pass-type-btn.active-silver { border-color: #c0c0c0; background: rgba(192,192,192,0.08); box-shadow: 0 0 16px rgba(192,192,192,0.2); }
        .pass-type-btn.active-gold   { border-color: #FFD700; background: rgba(255,215,0,0.08);  box-shadow: 0 0 16px rgba(255,215,0,0.2); }
        .pass-type-btn.active-black  { border-color: #d8dee9; background: linear-gradient(135deg, rgba(15,18,28,0.9), rgba(38,43,58,0.68)); box-shadow: 0 0 18px rgba(124,134,154,0.24); }
        .pass-type-btn.active-apex   { border-color: #67e8f9; background: linear-gradient(135deg, rgba(8,34,44,0.9), rgba(0,153,184,0.2)); box-shadow: 0 0 18px rgba(34,211,238,0.24); }
        .pass-type-btn.active-guild-hero { border-color: #60a5fa; background: rgba(37,99,235,0.1); box-shadow: 0 0 16px rgba(37,99,235,0.2); }
        .pass-type-btn.active-guild-master { border-color: #f4cf58; background: rgba(244,207,88,0.08); box-shadow: 0 0 16px rgba(244,207,88,0.18); }
        .pass-type-btn:disabled { cursor: not-allowed; opacity: 0.45; }
      `}</style>

      <div className="page-wrapper">
        <div className="container" style={{ maxWidth: 700 }}>

          {/* Header */}
          <div className="page-header">
            <div>
              <h1 className="page-title">
                <Award size={28} style={{ display: 'inline', marginRight: 10, color: '#FFD700' }} />
                Assign <span className="text-gradient">Pass</span>
              </h1>
              <p className="page-subtitle">Search a customer and assign a monthly pass</p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
                  <Crown size={17} style={{ color: '#f4cf58' }} />
                  Guild Membership Plans
                </div>
                <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                  Changes apply to new assignments only. The 50% benefit is fixed.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {guildPlans.map((plan) => (
                <section
                  key={plan.type}
                  style={{
                    padding: 14,
                    border: `1px solid ${PASS_COLOR[plan.type]}44`,
                    borderRadius: 'var(--radius-md)',
                    background: `${PASS_COLOR[plan.type]}08`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                    <strong style={{ display: 'flex', alignItems: 'center', gap: 7, color: PASS_COLOR[plan.type] }}>
                      {plan.type === 'GUILD_MASTER' ? <Crown size={15} /> : <Sword size={15} />}
                      {plan.name}
                    </strong>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={plan.isActive}
                        onChange={(event) => updatePlanState(plan.type, { isActive: event.target.checked })}
                      />
                      Enabled
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1fr) minmax(110px, 1fr)', gap: 10 }}>
                    <label className="form-group">
                      <span className="form-label">Price</span>
                      <input
                        className="form-input"
                        type="number"
                        min={1}
                        max={100000}
                        value={plan.price}
                        onChange={(event) => updatePlanState(plan.type, { price: Number(event.target.value) })}
                      />
                    </label>
                    <label className="form-group">
                      <span className="form-label">Validity Days</span>
                      <input
                        className="form-input"
                        type="number"
                        min={1}
                        max={365}
                        value={plan.validityDays}
                        onChange={(event) => updatePlanState(plan.type, { validityDays: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                  <label className="form-group" style={{ marginTop: 10 }}>
                    <span className="form-label">Description</span>
                    <input
                      className="form-input"
                      value={plan.description}
                      maxLength={300}
                      onChange={(event) => updatePlanState(plan.type, { description: event.target.value })}
                    />
                  </label>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 10 }}
                    onClick={() => handleSavePlan(plan)}
                    disabled={savingPlan === plan.type}
                  >
                    <Save size={13} />
                    {savingPlan === plan.type ? 'Saving...' : `Save ${plan.name}`}
                  </button>
                </section>
              ))}
            </div>
          </div>

          {/* Search card */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Customer
            </div>

            <div className="pass-search-wrapper" ref={wrapperRef}>
              <div className="pass-search-box" onClick={() => inputRef.current?.focus()}>
                <Search size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />

                {selectedUser ? (
                  <span className="pass-search-chip">
                    <User size={12} />
                    <span className="chip-name">{selectedUser.name}{selectedUser.phone ? ` · ${selectedUser.phone}` : ''}</span>
                    <button className="pass-chip-clear" onClick={(e) => { e.stopPropagation(); handleClear(); }}>
                      <X size={12} />
                    </button>
                  </span>
                ) : (
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder={loadingUsers ? 'Loading customers…' : 'Search by name, email or phone…'}
                    value={query}
                    disabled={loadingUsers}
                    onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
                    onFocus={() => { if (query) setShowDropdown(true); }}
                  />
                )}

                <ChevronDown size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0, transform: showDropdown ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
              </div>

              {/* Dropdown list */}
              {!selectedUser && showDropdown && (
                <div className="pass-dropdown">
                  {filtered.length > 0 ? filtered.map((u) => (
                    <button key={u.id} className="pass-dropdown-item" onMouseDown={() => handleSelect(u)}>
                      <div className="pass-dropdown-avatar">
                        <User size={15} style={{ color: 'white' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>{u.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 1 }}>
                          {u.phone ?? 'No phone'} · {u.email}
                        </div>
                      </div>
                    </button>
                  )) : (
                    <div className="pass-dropdown-empty">
                      {query.trim() ? `No customers matching "${query}"` : 'Start typing to search…'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* User detail + assign — only when user selected */}
          {selectedUser && (
            <div className="card" style={{ marginBottom: 20 }}>

              {/* Pass and membership history */}
              {loadingPasses ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 20 }}>Checking active passes…</div>
              ) : userPasses.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Pass &amp; Membership History
                  </div>
                  {userPasses.map((p) => {
                    const membership = isGuildMembershipType(p.passType);
                    const remaining = Math.max(0, p.totalHours - p.usedHours);
                    const pct = p.totalHours > 0 ? (p.usedHours / p.totalHours) * 100 : 0;
                    const color = PASS_COLOR[p.passType as PassType] ?? '#888';
                    const active = p.status === 'ACTIVE' && new Date(p.expiresAt) >= new Date();
                    const statusLabel = p.status === 'REVOKED' ? 'CANCELLED' : p.status;
                    return (
                      <div key={p.id} style={{ padding: '12px 16px', background: `${color}08`, border: `1px solid ${color}30`, borderRadius: 'var(--radius-md)', marginBottom: 8, opacity: active ? 1 : 0.72 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                          <div>
                            <span style={{ fontWeight: 700, color, fontSize: '0.85rem' }}>
                              {membership ? guildMembershipName(p.passType) : `${p.passType} PASS`}
                            </span>
                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              <Calendar size={11} />
                              Activated {new Date(p.purchasedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                              {' · '}
                              Expires {new Date(p.expiresAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                            </div>
                            <div style={{ marginTop: 4, fontSize: '0.68rem', fontWeight: 800, color: active ? '#4ade80' : '#f59e0b' }}>{statusLabel}</div>
                          </div>
                          {active && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {membership && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleExtend(p.id)}
                                  disabled={extendingPassId === p.id}
                                >
                                  <Clock3 size={13} />
                                  {extendingPassId === p.id ? 'Extending...' : '+30 Days'}
                                </button>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)' }}
                                onClick={() => handleRevoke(p.id, p.passType)}
                                disabled={revokingPassId === p.id}
                              >
                                <Ban size={13} />
                                {revokingPassId === p.id ? 'Cancelling...' : membership ? 'Cancel' : 'Revoke'}
                              </button>
                            </div>
                          )}
                        </div>
                        {membership ? (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                            {p.passType === 'GUILD_MASTER'
                              ? '50% OFF eligible solo and squad PS5 bookings every day'
                              : '50% OFF eligible solo PS5 bookings every day'}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{remaining}/{p.totalHours} hrs left</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pass selector */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Select Pass to Assign
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                  {passOptions.map((opt) => {
                    const color = PASS_COLOR[opt.type];
                    const active = selectedPass === opt.type;
                    const membership = isGuildMembershipType(opt.type);
                    return (
                      <button
                        key={opt.type}
                        onClick={() => setSelectedPass(opt.type)}
                        className={`pass-type-btn ${active ? `active-${opt.type.toLowerCase().replaceAll('_', '-')}` : ''}`}
                        disabled={!opt.isActive}
                      >
                        <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>{opt.icon}</div>
                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: active ? color : 'var(--color-text-primary)', marginBottom: 2 }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                          {membership
                            ? `${opt.validityDays} days · ₹${opt.price.toLocaleString('en-IN')}`
                            : `${opt.hours} hrs · ₹${opt.price.toLocaleString('en-IN')}`}
                        </div>
                        {!opt.isActive && <div style={{ marginTop: 3, fontSize: '0.65rem', color: '#f59e0b' }}>Disabled</div>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleAssign}
                disabled={assigning || !passOptions.find((option) => option.type === selectedPass)?.isActive}
              >
                <Award size={16} />
                {assigning
                  ? 'Assigning…'
                  : `Assign ${passOptions.find((p) => p.type === selectedPass)?.label} to ${selectedUser.name}`}
              </button>
            </div>
          )}

          {success && (
            <div className="alert alert-success">
              <CheckCircle size={16} /> {success}
            </div>
          )}
          {error && (
            <div className="alert alert-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
