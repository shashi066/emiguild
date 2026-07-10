'use client';

import './tournament.css';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Trophy, Plus, Users, Calendar, Zap, ChevronRight, Gamepad2, X, ArrowLeft } from 'lucide-react';
import Loading from './loading';

interface Tournament {
  id: string;
  name: string;
  game: string;
  date: string;
  entryFee: number;
  prizePool: number;
  maxPlayers: number;
  status: string;
  bracketGenerated: boolean;
  _count: { players: number; matches: number };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  REGISTRATION_OPEN: { label: 'Registration Open', color: '#00e676', bg: 'rgba(0,230,118,0.12)' },
  REGISTRATION_CLOSED: { label: 'Registration Closed', color: '#ffaa00', bg: 'rgba(255,170,0,0.12)' },
  ONGOING: { label: 'Ongoing', color: '#00d4ff', bg: 'rgba(0,212,255,0.12)' },
  FINISHED: { label: 'Finished', color: '#8b9cb8', bg: 'rgba(139,156,184,0.12)' },
};

export default function TournamentsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '', game: 'FC26', date: '', entryFee: 'Free', prizePool: '', maxPlayers: '16',
  });

  useEffect(() => {
    fetchTournaments();
  }, []);

  async function fetchTournaments() {
    setLoading(true);
    const res = await fetch('/api/tournaments');
    const data = await res.json();
    setTournaments(data.tournaments || []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        game: form.game,
        date: form.date,
        entryFee: form.entryFee || 'Free',
        prizePool: form.prizePool,
        maxPlayers: parseInt(form.maxPlayers) || 16,
      }),
    });
    if (res.ok) {
      setShowCreate(false);
      setForm({ name: '', game: 'FC26', date: '', entryFee: '', prizePool: '', maxPlayers: '16' });
      fetchTournaments();
    }
    setCreating(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-base)' }}>
      {/* Hero Banner */}
      <div className="tourn-hero">
        <div className="tourn-hero-bg" />
        <div className="container" style={{ position: 'relative', zIndex: 1, paddingTop: '2.5rem', paddingBottom: '3rem' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: '1.5rem', fontSize: '0.9rem', transition: 'color 0.2s ease' }}>
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div className="tourn-trophy-icon">
              <Trophy size={32} color="#FFD700" />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', fontFamily: 'Orbitron, sans-serif', color: '#6c63ff', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '4px' }}>
                EmiGuild Esports
              </div>
              <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 800, fontFamily: 'Orbitron, sans-serif', background: 'linear-gradient(135deg, #fff 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Tournaments
              </h1>
            </div>
          </div>
          <p style={{ color: 'var(--color-text-secondary)', maxWidth: '500px', fontSize: '1rem' }}>
            Compete against the best. Climb the bracket. Claim the crown.
          </p>

          {isAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary"
              style={{ marginTop: '1.5rem', fontFamily: 'Orbitron, sans-serif', fontSize: '0.8rem', letterSpacing: '0.05em' }}
            >
              <Plus size={16} />
              Create Tournament
            </button>
          )}
        </div>
      </div>

      <div className="container" style={{ paddingBottom: '4rem' }}>
        {loading ? (
          <Loading />
        ) : tournaments.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem', marginTop: '2rem' }}>
            <Gamepad2 size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }} />
            <h3 style={{ color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>No Tournaments Yet</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              {isAdmin ? 'Create your first tournament to get started.' : 'Check back soon for upcoming events.'}
            </p>
          </div>
        ) : (
          <div className="tourn-grid" style={{ marginTop: '2rem' }}>
            {tournaments.map((t) => {
              const statusCfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.REGISTRATION_OPEN;
              return (
                <Link key={t.id} href={`/tournaments/${t.id}`} className="tourn-card">
                  <div className="tourn-card-header">
                    <div className="tourn-card-game-badge">{t.game}</div>
                    <span className="tourn-status-badge" style={{ color: statusCfg.color, background: statusCfg.bg }}>
                      {statusCfg.label}
                    </span>
                  </div>

                  <h2 className="tourn-card-name">{t.name}</h2>

                  <div className="tourn-card-meta">
                    <span><Calendar size={13} /> {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span><Users size={13} /> {t._count.players} / {t.maxPlayers} Players</span>
                  </div>

                  <div className="tourn-card-stats">
                    <div className="tourn-stat">
                      <div className="tourn-stat-val">{t.prizePool || '—'}</div>
                      <div className="tourn-stat-lbl">Winner Reward</div>
                    </div>
                    <div className="tourn-stat">
                      <div className="tourn-stat-val">{t.entryFee || 'Free'}</div>
                      <div className="tourn-stat-lbl">Entry Fee</div>
                    </div>
                    <div className="tourn-stat">
                      <div className="tourn-stat-val">{t.maxPlayers}</div>
                      <div className="tourn-stat-lbl">Max Players</div>
                    </div>
                  </div>

                  <div className="tourn-card-footer">
                    <span style={{ color: 'var(--color-accent-primary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      View Tournament <ChevronRight size={14} />
                    </span>
                    {t.bracketGenerated && (
                      <span style={{ color: '#00d4ff', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Zap size={12} /> Bracket Live
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Tournament Modal */}
      {showCreate && (
        <div className="tourn-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="tourn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tourn-modal-header">
              <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.1rem' }}>
                <Trophy size={18} color="#FFD700" style={{ marginRight: '8px' }} />
                Create Tournament
              </h2>
              <button onClick={() => setShowCreate(false)} className="tourn-modal-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="tourn-form">
              <div className="tourn-form-group">
                <label>Tournament Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="EmiGuild FC26 Championship"
                  required
                  className="tourn-input"
                />
              </div>

              <div className="tourn-form-row">
                <div className="tourn-form-group">
                  <label>Game</label>
                  <select
                    value={form.game}
                    onChange={(e) => setForm({ ...form, game: e.target.value })}
                    className="tourn-input"
                  >
                    <option value="FC26">EA Sports FC 26</option>
                    <option value="FIFA 24">FIFA 24</option>
                    <option value="eFootball">eFootball</option>
                    <option value="Tekken 8">Tekken 8</option>
                    <option value="Street Fighter 6">Street Fighter 6</option>
                    <option value="COD">Call of Duty</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="tourn-form-group">
                  <label>Tournament Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                    className="tourn-input"
                  />
                </div>
              </div>

              <div className="tourn-form-row">
                <div className="tourn-form-group">
                  <label>Entry Fee</label>
                  <input
                    type="text"
                    value={form.entryFee}
                    onChange={(e) => setForm({ ...form, entryFee: e.target.value })}
                    placeholder="Free / ₹100 / ₹50"
                    className="tourn-input"
                  />
                </div>
                <div className="tourn-form-group">
                  <label>Winner Reward / Prize Pool</label>
                  <input
                    type="text"
                    value={form.prizePool}
                    onChange={(e) => setForm({ ...form, prizePool: e.target.value })}
                    placeholder="₹500 cash / Trophy / Gift voucher"
                    className="tourn-input"
                  />
                </div>
                <div className="tourn-form-group">
                  <label>Max Players</label>
                  <select
                    value={form.maxPlayers}
                    onChange={(e) => setForm({ ...form, maxPlayers: e.target.value })}
                    className="tourn-input"
                  >
                    <option value="4">4</option>
                    <option value="8">8</option>
                    <option value="16">16</option>
                    <option value="32">32</option>
                    <option value="64">64</option>
                  </select>
                </div>
              </div>

              <div className="tourn-modal-actions">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating…' : 'Create Tournament'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}