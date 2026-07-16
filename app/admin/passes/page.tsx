'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Award, CheckCircle, AlertCircle, Calendar, User, X, ChevronDown, Ban } from 'lucide-react';
import { decryptPhone } from '@/lib/crypto';

type PassType = 'BRONZE' | 'SILVER' | 'GOLD';

const PASS_OPTIONS: { type: PassType; icon: string; hours: number; price: number; label: string }[] = [
  { type: 'BRONZE', icon: '🥉', label: 'Bronze Pass', hours: 10, price: 1300 },
  { type: 'SILVER', icon: '🥈', label: 'Silver Pass', hours: 20, price: 2300 },
  { type: 'GOLD',   icon: '🥇', label: 'Gold Pass',   hours: 30, price: 3000 },
];

const PASS_COLOR: Record<PassType, string> = {
  BRONZE: '#cd7f32', SILVER: '#c0c0c0', GOLD: '#FFD700',
};

type UserItem = { id: string; name: string; email: string; phone: string | null };
type ActivePass = {
  id: string; passType: string; totalHours: number;
  usedHours: number; status: string; expiresAt: string;
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
  }, []);

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
      const res = await fetch(`/api/admin/passes?userId=${userId}`);
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
        const cfg = PASS_OPTIONS.find((p) => p.type === selectedPass)!;
        setSuccess(`${cfg.label} assigned to ${selectedUser.name}!`);
        fetchUserPasses(selectedUser.id);
      }
    } catch {
      setError('Failed to assign pass. Please try again.');
    } finally {
      setAssigning(false);
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

              {/* Active passes */}
              {loadingPasses ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 20 }}>Checking active passes…</div>
              ) : userPasses.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Active Passes
                  </div>
                  {userPasses.map((p) => {
                    const remaining = p.totalHours - p.usedHours;
                    const pct = (p.usedHours / p.totalHours) * 100;
                    const color = PASS_COLOR[p.passType as PassType] ?? '#888';
                    return (
                      <div key={p.id} style={{ padding: '12px 16px', background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                          <div>
                            <span style={{ fontWeight: 700, color, fontSize: '0.85rem' }}>{p.passType} PASS</span>
                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              <Calendar size={11} /> Expires {new Date(p.expiresAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                            </div>
                          </div>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)' }}
                            onClick={() => handleRevoke(p.id, p.passType)}
                            disabled={revokingPassId === p.id}
                          >
                            <Ban size={13} />
                            {revokingPassId === p.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{remaining}/{p.totalHours} hrs left</span>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.8rem', color: '#f59e0b' }}>
                    <AlertCircle size={13} /> This user already has an active pass. You can still assign another.
                  </div>
                </div>
              )}

              {/* Pass selector */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Select Pass to Assign
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {PASS_OPTIONS.map((opt) => {
                    const color = PASS_COLOR[opt.type];
                    const active = selectedPass === opt.type;
                    return (
                      <button
                        key={opt.type}
                        onClick={() => setSelectedPass(opt.type)}
                        className={`pass-type-btn ${active ? `active-${opt.type.toLowerCase()}` : ''}`}
                      >
                        <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>{opt.icon}</div>
                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: active ? color : 'var(--color-text-primary)', marginBottom: 2 }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                          {opt.hours} hrs · ₹{opt.price.toLocaleString('en-IN')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleAssign}
                disabled={assigning}
              >
                <Award size={16} />
                {assigning
                  ? 'Assigning…'
                  : `Assign ${PASS_OPTIONS.find((p) => p.type === selectedPass)?.label} to ${selectedUser.name}`}
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
