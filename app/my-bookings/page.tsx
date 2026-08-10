'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen, Calendar, Clock, Monitor, IndianRupee,
  XCircle, AlertCircle, CheckCircle, Plus, Award, Crown, Sword, Gamepad2,
} from 'lucide-react';
import { formatTime, formatDate, formatCurrency, getTodayString } from '@/lib/utils';
import {
  guildMembershipName,
  isGuildMembershipType,
} from '@/lib/guild-membership';

type Booking = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalPrice: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'CHECKED_IN';
  notes?: string;
  adminComment?: string | null;
  passHoursDeducted?: number;
  discount: number;
  appliedBenefitType: string | null;
  station: { id: string; name: string };
};

type ActivePass = {
  id: string;
  passType: string;
  totalHours: number;
  usedHours: number;
  price: number;
  status: string;
  purchasedAt: string;
  expiresAt: string;
  bookings: {
    id: string; date: string; startTime: string; endTime: string;
    passHoursDeducted: number; status: string;
    station: { name: string };
  }[];
};

const STATUS_CONFIG = {
  PENDING:    { label: 'Pending',    cls: 'badge-pending',    icon: Clock },
  CONFIRMED:  { label: 'Confirmed',  cls: 'badge-confirmed',  icon: CheckCircle },
  CANCELLED:  { label: 'Cancelled',  cls: 'badge-cancelled',  icon: XCircle },
  COMPLETED:  { label: 'Completed',  cls: 'badge-completed',  icon: CheckCircle },
  CHECKED_IN: { label: 'Checked In', cls: 'badge-checkedin',  icon: CheckCircle },
};

const PASS_COLOR: Record<string, string> = {
  BRONZE: '#cd7f32',
  SILVER: '#c0c0c0',
  GOLD:   '#FFD700',
  BLACK:  '#d8dee9',
  APEX:   '#67e8f9',
};
const PASS_ICON: Record<string, string> = { BRONZE: '🥉', SILVER: '🥈', GOLD: '🥇', BLACK: '🖤', APEX: '⚡' };

export default function MyBookingsPage() {
  const [bookings, setBookings]       = useState<Booking[]>([]);
  const [userPasses, setUserPasses] = useState<ActivePass[]>([]);
  const [loading, setLoading]         = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError]             = useState('');
  const [activeTab, setActiveTab]     = useState<'upcoming' | 'past' | 'pass'>('upcoming');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [bRes, pRes] = await Promise.all([
        fetch('/api/bookings?limit=50'),
        fetch('/api/user/pass?history=1'),
      ]);
      const bData = await bRes.json();
      const pData = pRes.ok ? await pRes.json() : { passes: [] };
      setBookings(bData.bookings ?? []);
      setUserPasses(pData.passes ?? []);
    } catch {
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    setCancellingId(id);
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      const data = await res.json();
      if (res.ok) {
        setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'CANCELLED' } : b)));
        // Refresh pass in case hours were restored
        const pRes = await fetch('/api/user/pass?history=1');
        const pData = await pRes.json();
        setUserPasses(pData.passes ?? []);
      } else {
        setError(data.error ?? 'This booking could not be cancelled.');
      }
    } finally {
      setCancellingId(null);
    }
  };

  const today = getTodayString();
  const upcoming = bookings.filter((b) => b.date >= today && b.status !== 'CANCELLED' && b.status !== 'CHECKED_IN');
  const past     = bookings.filter((b) => b.date < today  || b.status === 'CANCELLED'  || b.status === 'CHECKED_IN');
  const canCancel = (b: Booking) => (
    (b.status === 'PENDING' || b.status === 'CONFIRMED')
    && b.date >= today
  );
  const displayList = activeTab === 'upcoming' ? upcoming : past;

  const TabBtn = ({ tab, label, count }: { tab: 'upcoming' | 'past' | 'pass'; label: string; count?: number }) => (
    <button
      className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-ghost'}`}
      onClick={() => setActiveTab(tab)}
    >
      {label}
      {count !== undefined && (
        <span style={{
          background: activeTab === tab ? 'rgba(255,255,255,0.2)' : 'rgba(108,99,255,0.15)',
          color: activeTab === tab ? 'white' : 'var(--color-accent-primary)',
          borderRadius: '999px', padding: '2px 8px',
          fontSize: '0.75rem', fontWeight: 700,
        }}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="page-wrapper">
      <div className="container">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <BookOpen size={28} style={{ display: 'inline', marginRight: 10, color: 'var(--color-accent-primary)' }} />
              My <span className="text-gradient">Bookings</span>
            </h1>
            <p className="page-subtitle">Manage your gaming session reservations</p>
          </div>
          <Link href="/book" className="btn btn-primary" id="new-booking-btn">
            <Plus size={18} /> New Booking
          </Link>
        </div>

        {error && <div className="alert alert-error"><AlertCircle size={16} />{error}</div>}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-xl)', flexWrap: 'wrap' }}>
          <TabBtn tab="upcoming" label="Upcoming" count={upcoming.length} />
          <TabBtn tab="past"     label="Past & Cancelled" count={past.length} />
          <TabBtn tab="pass"     label="My Passes" />
        </div>

        {/* ── Bookings list ── */}
        {activeTab !== 'pass' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--color-text-muted)' }}>
              Loading your bookings...
            </div>
          ) : displayList.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon"><BookOpen size={32} /></div>
                <div className="empty-state-title">{activeTab === 'upcoming' ? 'No Upcoming Bookings' : 'No Past Bookings'}</div>
                <p className="empty-state-text">
                  {activeTab === 'upcoming'
                    ? "You don't have any upcoming sessions. Book a gaming station now!"
                    : "You haven't completed any gaming sessions yet."}
                </p>
                {activeTab === 'upcoming' && (
                  <Link href="/book" className="btn btn-primary" style={{ marginTop: 'var(--space-md)' }}>
                    <Calendar size={16} /> Book a Session
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {displayList.map((booking) => {
                const cfg = STATUS_CONFIG[booking.status];
                const Icon = cfg.icon;
                const usedPass = (booking.passHoursDeducted ?? 0) > 0;
                const usedMembership = isGuildMembershipType(booking.appliedBenefitType);
                return (
                  <div key={booking.id} className="card card-hover" style={{ padding: 'var(--space-lg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '1rem' }}>{booking.station.name}</span>
                          <span className={`badge ${cfg.cls}`}><Icon size={11} />{cfg.label}</span>
                          {usedPass && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', color: '#FFD700' }}>
                              <Award size={10} /> Pass
                            </span>
                          )}
                          {usedMembership && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.28)', color: '#4ade80' }}>
                              <Award size={10} /> {guildMembershipName(booking.appliedBenefitType!)}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Calendar size={14} style={{ color: 'var(--color-accent-primary)' }} />{formatDate(booking.date)}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock size={14} style={{ color: 'var(--color-accent-primary)' }} />{formatTime(booking.startTime)} — {formatTime(booking.endTime)}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Monitor size={14} style={{ color: 'var(--color-accent-primary)' }} />{booking.duration} hr{booking.duration > 1 ? 's' : ''}
                          </span>
                        </div>
                        {booking.notes && (
                          <div className="game-request-note">
                            <Gamepad2 size={13} aria-hidden="true" />
                            <span><strong>Game requested:</strong> {booking.notes}</span>
                          </div>
                        )}
                        {booking.status === 'CANCELLED' && booking.adminComment && (
                          <div style={{ marginTop: 'var(--space-sm)', padding: '8px 12px', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--color-accent-error)' }}>
                            <strong>Admin note:</strong> {booking.adminComment}
                          </div>
                        )}
                        <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>ID: #{booking.id.slice(-8).toUpperCase()}</div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-sm)' }}>
                        {usedPass ? (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#4ade80' }}>Pass Booking</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{booking.passHoursDeducted} hr{(booking.passHoursDeducted ?? 0) > 1 ? 's' : ''} deducted</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-accent-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <IndianRupee size={16} />{booking.totalPrice.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Pay at counter</div>
                            {usedMembership && (
                              <div style={{ marginTop: 2, fontSize: '0.72rem', color: '#4ade80', fontWeight: 700 }}>
                                {booking.discount}% Guild discount applied
                              </div>
                            )}
                          </div>
                        )}
                        {canCancel(booking) && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleCancel(booking.id)} disabled={cancellingId === booking.id} id={`cancel-booking-${booking.id}`}>
                            <XCircle size={14} />{cancellingId === booking.id ? 'Cancelling...' : 'Cancel'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── My Pass tab ── */}
        {activeTab === 'pass' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--color-text-muted)' }}>Loading...</div>
          ) : userPasses.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon"><Award size={32} style={{ color: '#FFD700' }} /></div>
                <div className="empty-state-title">No Passes Yet</div>
                <p className="empty-state-text">You don&apos;t have a pass or Guild Membership yet. Visit our guild to join!</p>
                <Link href="/passes" className="btn btn-primary" style={{ marginTop: 'var(--space-md)' }}>
                  View Pass Plans
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {userPasses.map((activePass) => {
                const membership = isGuildMembershipType(activePass.passType);
                const color = membership
                  ? activePass.passType === 'GUILD_MASTER' ? '#f4cf58' : '#60a5fa'
                  : PASS_COLOR[activePass.passType] ?? '#c0c0c0';
                const icon = PASS_ICON[activePass.passType] ?? '🎟️';
                const remaining = Math.max(0, activePass.totalHours - activePass.usedHours);
                const pct = activePass.totalHours > 0
                  ? Math.min(100, (activePass.usedHours / activePass.totalHours) * 100)
                  : 0;
                const expires = new Date(activePass.expiresAt);
                const daysLeft = Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86400000));
                const active = activePass.status === 'ACTIVE' && expires >= new Date();
                const statusLabel = activePass.status === 'REVOKED' ? 'CANCELLED' : activePass.status;
                const membershipName = guildMembershipName(activePass.passType);

                return (
                  <div key={activePass.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="card" style={{ border: `1px solid ${color}44`, boxShadow: `0 0 30px ${color}22`, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at top right, ${color}0d, transparent 60%)`, pointerEvents: 'none' }} />
                      <div style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                          <div>
                            <div style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', marginBottom: 8, color }}>
                              {membership
                                ? activePass.passType === 'GUILD_MASTER'
                                  ? <Crown size={34} aria-hidden="true" />
                                  : <Sword size={34} aria-hidden="true" />
                                : <span style={{ fontSize: '2.3rem' }}>{icon}</span>}
                            </div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                              {membership
                                ? membershipName
                                : `${activePass.passType.charAt(0) + activePass.passType.slice(1).toLowerCase()} Pass`}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                              Activated {new Date(activePass.purchasedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} · ₹{activePass.price.toLocaleString('en-IN')}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: '999px', background: active ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${active ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: '0.78rem', fontWeight: 700, color: active ? '#4ade80' : '#ef4444' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
                              {statusLabel}
                            </div>
                            <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                              Expires {expires.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                              {active && (membership || daysLeft <= 7) && (
                                <span style={{ color: daysLeft <= 7 ? '#f59e0b' : 'var(--color-text-muted)', marginLeft: 4 }}>
                                  ({daysLeft} days left)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {membership ? (
                          <div style={{ marginBottom: 16, padding: '12px 14px', borderLeft: `3px solid ${color}`, background: `${color}0b` }}>
                            <div style={{ color, fontWeight: 800, fontSize: '0.82rem', marginBottom: 4 }}>Membership Benefit</div>
                            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.84rem', lineHeight: 1.55 }}>
                              {activePass.passType === 'GUILD_MASTER'
                                ? '50% OFF eligible solo and squad PS5 bookings every day.'
                                : '50% OFF eligible solo PS5 bookings every day.'}
                            </div>
                            <div style={{ marginTop: 5, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                              GameZone verifies and manually applies the discount. Cannot be combined with other offers.
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                              <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Hours used</span>
                              <span style={{ fontSize: '0.875rem', fontWeight: 700, color }}>
                                {activePass.usedHours} / {activePass.totalHours} hrs
                              </span>
                            </div>
                            <div style={{ height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${color}99, ${color})`, borderRadius: 5 }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{activePass.usedHours} hrs used</span>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color }}>{remaining} hrs remaining</span>
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {active && (
                            <Link href="/book" className="btn btn-primary" style={{ display: 'inline-flex' }}>
                              <Calendar size={16} /> {membership ? 'Book a PS5 Session' : 'Book a Session with Pass'}
                            </Link>
                          )}
                          {membership && (!active || daysLeft <= 7) && (
                            <a href="tel:+919989562474" className="btn btn-ghost" style={{ display: 'inline-flex' }}>
                              Renew Membership
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {!membership && activePass.bookings.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                          Sessions Used with This Pass
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {activePass.bookings.map((b) => (
                            <div key={b.id} className="card" style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{b.station.name}</div>
                                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                    {formatDate(b.date)} · {formatTime(b.startTime)} — {formatTime(b.endTime)}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color }}>−{b.passHoursDeducted} hr{b.passHoursDeducted > 1 ? 's' : ''}</div>
                                  <div style={{ fontSize: '0.72rem', color: b.status === 'CANCELLED' ? '#ef4444' : 'var(--color-text-muted)', marginTop: 2, textTransform: 'uppercase', fontWeight: 600 }}>{b.status}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
