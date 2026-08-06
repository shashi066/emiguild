'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Search, Award, CheckCircle, AlertCircle, Calendar, User, X, ChevronDown, Ban,
  Crown, Sword, Save, Clock3, Edit2,
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

const getDaysLeft = (expiryDate: Date | string) => {
  const diff = new Date(expiryDate).getTime() - new Date().getTime();
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Expires today';
  return `${days} day${days === 1 ? '' : 's'} left`;
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
  const [editingPlan, setEditingPlan]     = useState<GuildMembershipPlan | null>(null);
  const [allActivePasses, setAllActivePasses]         = useState<any[]>([]);
  const [loadingActivePasses, setLoadingActivePasses] = useState(true);
  const [showAssignModal, setShowAssignModal]         = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const loadAllActivePasses = async () => {
    setLoadingActivePasses(true);
    try {
      const res = await fetch('/api/admin/passes?all=1');
      if (res.ok) {
        const data = await res.json();
        const decrypted = (data.passes ?? []).map((p: any) => {
          if (p.user && p.user.phone) {
            try {
              p.user.phone = decryptPhone(p.user.phone);
            } catch {
              // ignore
            }
          }
          return p;
        });
        setAllActivePasses(decrypted);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingActivePasses(false);
    }
  };

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
    loadAllActivePasses();
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
        loadAllActivePasses();
        setShowAssignModal(false);
      }
    } catch {
      setError('Failed to assign pass. Please try again.');
    } finally {
      setAssigning(false);
    }
  };

  const handleExtend = async (passId: string, userName?: string, userId?: string) => {
    const targetName = userName || selectedUser?.name || 'Customer';
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
        setSuccess(`Membership extended by 30 days for ${targetName}.`);
        if (selectedUser && selectedUser.id === userId) {
          fetchUserPasses(selectedUser.id);
        }
        loadAllActivePasses();
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
        setEditingPlan(null);
      }
    } catch {
      setError('Failed to save membership plan. Please try again.');
    } finally {
      setSavingPlan(null);
    }
  };

  const handleRevoke = async (passId: string, passType: string, userName?: string, userId?: string) => {
    const targetName = userName || selectedUser?.name || 'Customer';
    if (!confirm(`Revoke this ${passType} pass for ${targetName}?`)) return;

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
        setSuccess(`${passType} pass revoked for ${targetName}.`);
        if (selectedUser && selectedUser.id === userId) {
          fetchUserPasses(selectedUser.id);
        }
        loadAllActivePasses();
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={18} style={{ color: '#FFD700' }} />
                Active Customer Passes
              </div>
              <button 
                className="btn btn-primary" 
                onClick={() => { handleClear(); setShowAssignModal(true); }}
                id="open-assign-modal-btn"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', height: 'auto', fontSize: '0.85rem' }}
              >
                <Award size={14} /> Assign a Pass
              </button>
            </div>

            {loadingActivePasses ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                <div className="spinner" />
              </div>
            ) : allActivePasses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                No active passes found. Click "Assign a Pass" to get started.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {allActivePasses.map((p) => {
                  const membership = isGuildMembershipType(p.passType);
                  const color = PASS_COLOR[p.passType as PassType] ?? '#888';
                  const remaining = Math.max(0, p.totalHours - p.usedHours);
                  const pct = p.totalHours > 0 ? (p.usedHours / p.totalHours) * 100 : 0;
                  const daysLeft = getDaysLeft(p.expiresAt);
                  
                  return (
                    <div 
                      key={p.id} 
                      style={{ 
                        padding: '14px 16px', 
                        background: `${color}06`, 
                        border: `1px solid ${color}25`, 
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>
                            {p.user?.name ?? 'Unknown Customer'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                            {p.user?.email} {p.user?.phone ? `· ${p.user.phone}` : ''}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {membership && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '4px 8px', height: 'auto', fontSize: '0.75rem' }}
                              onClick={() => handleExtend(p.id, p.user?.name, p.user?.id)}
                              disabled={extendingPassId === p.id}
                            >
                              <Clock3 size={12} style={{ marginRight: 4 }} />
                              {extendingPassId === p.id ? 'Extending...' : '+30 Days'}
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 8px', height: 'auto', fontSize: '0.75rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}
                            onClick={() => handleRevoke(p.id, p.passType, p.user?.name, p.user?.id)}
                            disabled={revokingPassId === p.id}
                          >
                            <Ban size={12} style={{ marginRight: 4 }} />
                            {revokingPassId === p.id ? 'Cancelling...' : membership ? 'Cancel' : 'Revoke'}
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ 
                            fontWeight: 700, 
                            color, 
                            fontSize: '0.75rem', 
                            textTransform: 'uppercase',
                            background: `${color}12`,
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: `1px solid ${color}25`
                          }}>
                            {membership ? guildMembershipName(p.passType) : `${p.passType} PASS`}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                            {membership ? (
                              p.passType === 'GUILD_MASTER'
                                ? '50% OFF solo/squad PS5 bookings'
                                : '50% OFF solo PS5 bookings'
                            ) : (
                              `${remaining}/${p.totalHours} hours remaining`
                            )}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={11} />
                          Expires {new Date(p.expiresAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                          <span style={{ 
                            fontWeight: 700, 
                            color: daysLeft.includes('day') ? 'var(--color-accent-secondary)' : 'var(--color-accent-danger)', 
                            background: daysLeft.includes('day') ? 'rgba(0,212,255,0.06)' : 'rgba(239,68,68,0.06)',
                            padding: '2px 6px',
                            borderRadius: 4,
                            marginLeft: 4
                          }}>
                            {daysLeft}
                          </span>
                        </div>
                      </div>

                      {!membership && (
                        <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
                          <div style={{ width: `${100 - pct}%`, height: '100%', background: color, borderRadius: 2 }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Guild Membership Plans Card (moved to bottom) */}
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
                <div
                  key={plan.type}
                  style={{
                    padding: 16,
                    border: `1px solid ${PASS_COLOR[plan.type]}33`,
                    borderRadius: 'var(--radius-md)',
                    background: `${PASS_COLOR[plan.type]}06`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <strong style={{ display: 'flex', alignItems: 'center', gap: 8, color: PASS_COLOR[plan.type], fontSize: '0.95rem' }}>
                      {plan.type === 'GUILD_MASTER' ? <Crown size={16} /> : <Sword size={16} />}
                      {plan.name}
                    </strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {plan.isActive ? (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, color: '#10b981',
                          background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                          borderRadius: 999, padding: '2px 8px',
                        }}>
                          Active
                        </span>
                      ) : (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)',
                          background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)',
                          borderRadius: 999, padding: '2px 8px',
                        }}>
                          Inactive
                        </span>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '4px 8px', height: 'auto' }}
                        onClick={() => setEditingPlan({ ...plan })}
                        id={`edit-guild-plan-${plan.type.toLowerCase()}`}
                      >
                        <Edit2 size={13} style={{ marginRight: 4 }} /> Edit
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: 'var(--color-text-primary)',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 6,
                      padding: '3px 8px',
                    }}>
                      ₹{plan.price}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      Valid for <strong>{plan.validityDays} days</strong>
                    </span>
                  </div>

                  {plan.description && (
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                      {plan.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {success && (
            <div className="alert alert-success" style={{ marginBottom: 16 }}>
              <CheckCircle size={16} /> {success}
            </div>
          )}
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

        </div>
      </div>

      {/* ══ Assign Pass Modal ════════════════════════════════ */}
      {showAssignModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'var(--space-xl)',
          }}
          onClick={(e) => e.target === e.currentTarget && setShowAssignModal(false)}
        >
          <div className="card" style={{ width: '100%', maxWidth: 500, overflow: 'visible' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-accent-primary)' }}>
                <Award size={18} />
                Assign New Pass
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAssignModal(false)} id="modal-close-btn" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* Search input inside modal */}
            <div className="form-group" style={{ position: 'relative', zIndex: 1001 }}>
              <label className="form-label">Search Customer</label>
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
                      autoFocus
                    />
                  )}

                  <ChevronDown size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0, transform: showDropdown ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                </div>

                {/* Dropdown list */}
                {!selectedUser && showDropdown && (
                  <div className="pass-dropdown" style={{ zIndex: 1002, position: 'absolute', width: '100%' }}>
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

            {/* Pass selector & details inside modal (visible only when user selected) */}
            {selectedUser && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
                {userPasses.length > 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', background: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                    <strong>Note:</strong> Customer already has <strong>{userPasses.filter(p => p.status === 'ACTIVE').length} active</strong> pass(es).
                  </div>
                )}

                {/* Pass options selector */}
                <div>
                  <label className="form-label">Select Pass to Assign</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                    {passOptions.map((opt) => {
                      const isGuild = isGuildMembershipType(opt.type);
                      const actCls = `active-${opt.type.toLowerCase()}`;
                      const active = selectedPass === opt.type;
                      return (
                        <button
                          key={opt.type}
                          type="button"
                          className={`pass-type-btn ${active ? actCls : ''}`}
                          onClick={() => setSelectedPass(opt.type)}
                          disabled={!opt.isActive}
                          style={{
                            padding: '12px 8px', fontSize: '0.8rem',
                            borderWidth: '2px', borderColor: active ? undefined : 'var(--color-border)',
                          }}
                        >
                          <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>{opt.icon}</div>
                          <div style={{ fontWeight: 700, color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontSize: '0.75rem', lineHeight: 1.2 }}>
                            {opt.label}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 4, fontFamily: 'Orbitron, sans-serif' }}>
                            ₹{opt.price}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Assign button */}
                <div style={{ marginTop: 8 }}>
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
              </div>
            )}

            {/* Footer / Cancel when no user or simple cancel */}
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: selectedUser ? 10 : 20 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => { handleClear(); setShowAssignModal(false); }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Edit Guild Membership Plan Modal ════════════════════════════════ */}
      {editingPlan && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'var(--space-xl)',
          }}
          onClick={(e) => e.target === e.currentTarget && setEditingPlan(null)}
        >
          <div className="card" style={{ width: '100%', maxWidth: 480 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, color: PASS_COLOR[editingPlan.type] }}>
                {editingPlan.type === 'GUILD_MASTER' ? <Crown size={18} /> : <Sword size={18} />}
                Edit {editingPlan.name}
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingPlan(null)} id="modal-close-btn" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Active Toggle switch */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(255,255,255,0.02)', padding: '12px var(--space-md)',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Enable Membership Plan</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                    Available for customers to purchase
                  </div>
                </div>
                <label style={{ cursor: 'pointer', display: 'inline-block' }}>
                  <input
                    type="checkbox"
                    checked={editingPlan.isActive}
                    onChange={(e) => setEditingPlan(p => p ? { ...p, isActive: e.target.checked } : null)}
                    style={{ display: 'none' }}
                  />
                  <div style={{
                    width: 44, height: 22,
                    background: editingPlan.isActive ? 'var(--color-accent-success)' : 'rgba(255,255,255,0.1)',
                    borderRadius: 99, position: 'relative', transition: 'background 0.2s',
                  }}>
                    <div style={{
                      width: 16, height: 16, background: '#fff', borderRadius: '50%',
                      position: 'absolute', top: 3,
                      left: editingPlan.isActive ? 25 : 3,
                      transition: 'left 0.2s',
                    }} />
                  </div>
                </label>
              </div>

              {/* Price & Validity row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-plan-price">Price (₹)</label>
                  <input
                    id="edit-plan-price"
                    type="number"
                    min={0}
                    className="form-input"
                    value={editingPlan.price}
                    onChange={(e) => setEditingPlan(p => p ? { ...p, price: Number(e.target.value) } : null)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-plan-validity">Validity (Days)</label>
                  <input
                    id="edit-plan-validity"
                    type="number"
                    min={1}
                    className="form-input"
                    value={editingPlan.validityDays}
                    onChange={(e) => setEditingPlan(p => p ? { ...p, validityDays: Number(e.target.value) } : null)}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label" htmlFor="edit-plan-desc">Description</label>
                <textarea
                  id="edit-plan-desc"
                  className="form-input"
                  rows={3}
                  maxLength={300}
                  value={editingPlan.description ?? ''}
                  onChange={(e) => setEditingPlan(p => p ? { ...p, description: e.target.value } : null)}
                  style={{ resize: 'none', width: '100%' }}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-xl)' }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setEditingPlan(null)}
                disabled={savingPlan === editingPlan.type}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => handleSavePlan(editingPlan)}
                disabled={savingPlan === editingPlan.type}
                id="save-guild-plan-btn"
              >
                <Save size={15} />
                {savingPlan === editingPlan.type ? 'Saving…' : 'Save Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
