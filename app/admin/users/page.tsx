'use client';

import { useEffect, useState } from 'react';
import {
  Users, Shield, Calendar, KeyRound,
  RefreshCw, X, Eye, EyeOff, CheckCircle, AlertCircle, Copy, Check,
} from 'lucide-react';
import { decryptPhone } from '@/lib/crypto';

type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: string;
  _count: { bookings: number };
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function generatePassword(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetModal({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const [password, setPassword]     = useState(() => generatePassword());
  const [showPwd, setShowPwd]       = useState(true);
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);
  const [emailSent, setEmailSent]   = useState(false);
  const [error, setError]           = useState('');
  const [copied, setCopied]         = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tempPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Reset failed.'); return; }
      setEmailSent(Boolean(data.emailSent));
      setDone(true);
    } catch {
      setError('Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-lg)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 440, position: 'relative', animation: 'fadeInUp 0.2s ease' }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-muted)',
          }}
        >
          <X size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-lg)' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(108,99,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-accent-primary)',
          }}>
            <KeyRound size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Reset Password</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              {user.name} · {user.email}
            </p>
          </div>
        </div>

        {!done ? (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)', lineHeight: 1.6 }}>
              Set a temporary password for this customer. Tell them to change it after logging in.
            </p>

            {/* Password field */}
            <div className="form-group">
              <label className="form-label">Temporary Password</label>
              <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingRight: 44, fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '0.05em' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Copy button */}
                <button
                  type="button"
                  onClick={copy}
                  className="btn btn-ghost btn-sm"
                  title="Copy password"
                  style={{ flexShrink: 0 }}
                >
                  {copied ? <Check size={15} style={{ color: 'var(--color-accent-success)' }} /> : <Copy size={15} />}
                </button>

                {/* Re-generate */}
                <button
                  type="button"
                  onClick={() => setPassword(generatePassword())}
                  className="btn btn-ghost btn-sm"
                  title="Generate new password"
                  style={{ flexShrink: 0 }}
                >
                  <RefreshCw size={15} />
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
                Auto-generated. You can edit it or click 🔄 to generate a new one.
              </p>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)' }}>
                <AlertCircle size={15} /> {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={handleReset}
                disabled={loading || password.length < 6}
              >
                <KeyRound size={15} />
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </>
        ) : (
          /* Success state */
          <div style={{ textAlign: 'center', padding: 'var(--space-lg) 0' }}>
            <CheckCircle size={48} style={{ color: 'var(--color-accent-success)', marginBottom: 'var(--space-md)' }} />
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Password Reset!</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xl)' }}>
              {emailSent
                ? <>The temporary password was emailed to <strong>{user.email}</strong>.</>
                : <>The email could not be sent. Share this password with <strong>{user.name}</strong>:</>}
            </p>

            {/* Show final password prominently */}
            <div style={{
              background: 'rgba(108,99,255,0.08)',
              border: '1px solid rgba(108,99,255,0.25)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-lg)',
              marginBottom: 'var(--space-xl)',
              position: 'relative',
            }}>
              <div style={{
                fontFamily: 'Orbitron, monospace',
                fontSize: '1.4rem',
                fontWeight: 700,
                color: 'var(--color-accent-primary)',
                letterSpacing: '0.1em',
              }}>
                {password}
              </div>
              <button
                onClick={copy}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                }}
                title="Copy"
              >
                {copied ? <Check size={14} style={{ color: 'var(--color-accent-success)' }} /> : <Copy size={14} />}
              </button>
            </div>

            <div className={emailSent ? 'alert alert-info' : 'alert alert-error'} style={{ textAlign: 'left', marginBottom: 'var(--space-lg)' }}>
              <AlertCircle size={15} />
              {emailSent
                ? 'The email asks the customer to change this password after logging in.'
                : 'Share it manually and ask the customer to change it after logging in.'}
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const [users, setUsers]           = useState<User[]>([]);
  const [loading, setLoading]       = useState(true);
  const [resetTarget, setResetTarget] = useState<User | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers((data.users ?? []).map((user: User) => ({
        ...user,
        phone: decryptPhone(user.phone),
      })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const adminCount = users.filter((u) => u.role === 'ADMIN').length;
  const userCount  = users.filter((u) => u.role === 'USER').length;

  return (
    <div>
      {resetTarget && (
        <ResetModal user={resetTarget} onClose={() => { setResetTarget(null); }} />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">{userCount} customers · {adminCount} admins</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} id="refresh-users-btn">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="stats-grid" style={{ marginBottom: 'var(--space-xl)' }}>
        {[
          { label: 'Total Users', value: users.length, color: '#6c63ff', bg: 'rgba(108,99,255,0.12)' },
          { label: 'Customers',   value: userCount,    color: '#00d4ff', bg: 'rgba(0,212,255,0.08)' },
          { label: 'Admins',      value: adminCount,   color: '#ffaa00', bg: 'rgba(255,170,0,0.08)' },
        ].map((card, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: card.bg, color: card.color }}>
              <Users size={22} />
            </div>
            <div className="stat-value" style={{ color: card.color, fontSize: '1.8rem' }}>{card.value}</div>
            <div className="stat-label">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Users table */}
      {loading ? (
        <div className="loading-state"><div className="spinner" />Loading users...</div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Contact</th>
                <th>Role</th>
                <th>Bookings</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: user.role === 'ADMIN' ? 'var(--gradient-primary)' : 'rgba(108,99,255,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.9rem', fontWeight: 700, flexShrink: 0,
                        color: user.role === 'ADMIN' ? 'white' : 'var(--color-accent-primary)',
                      }}>
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <strong>{user.name}</strong>
                        <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                          #{user.id.slice(-6).toUpperCase()}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>{user.email}</div>
                    {user.phone && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{user.phone}</div>
                    )}
                  </td>
                  <td>
                    {user.role === 'ADMIN' ? (
                      <span className="badge badge-confirmed">
                        <Shield size={11} /> Admin
                      </span>
                    ) : (
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                        User
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <strong style={{ color: 'var(--color-text-primary)' }}>{user._count.bookings}</strong>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={13} />
                      {new Date(user.createdAt).toLocaleDateString('en-IN', {
                        year: 'numeric', month: 'short', day: 'numeric',
                        timeZone: 'Asia/Kolkata',
                      })}
                    </div>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setResetTarget(user)}
                      title="Reset password"
                      id={`reset-pwd-${user.id}`}
                      style={{ color: 'var(--color-accent-primary)', gap: 6 }}
                    >
                      <KeyRound size={14} />
                      Reset Password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
