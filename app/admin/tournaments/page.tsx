'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy, Plus, Trash2, Edit2, X, Users, Calendar } from 'lucide-react';
import '@/app/tournaments/tournament.css';

interface Tournament {
  id: string;
  name: string;
  game: string;
  date: string;
  entryFee: string;
  prizePool: string;
  maxPlayers: number;
  status: string;
  bracketGenerated: boolean;
  _count: { players: number; matches: number };
}

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', game: 'FC26', date: '', entryFee: 'Free', prizePool: '', maxPlayers: '16',
  });

  const fetchTournaments = async () => {
    setLoading(true);
    const res = await fetch('/api/tournaments');
    const data = await res.json();
    setTournaments(data.tournaments || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchTournaments();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
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
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/tournaments/${id}`, { method: 'DELETE' });
    setDeleteConfirm(null);
    fetchTournaments();
  };

  return (
    <div className="page-shell">
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div className="section-tag">
              <Trophy size={14} />
              Tournaments
            </div>
            <h1 className="section-title">
              Manage <span className="text-gradient">Tournaments</span>
            </h1>
            <p className="section-description">
              Create and manage gaming tournaments, participants, and brackets.
            </p>
          </div>

          <div style={{ marginBottom: 'var(--space-xl)', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary">
              <Plus size={18} />
              Create Tournament
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem' }}><div className="tourn-spinner" /></div>
          ) : tournaments.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '4rem' }}>
              <Trophy size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }} />
              <h3 style={{ color: 'var(--color-text-secondary)' }}>No Tournaments</h3>
            </div>
          ) : (
            <div className="tourn-grid">
              {tournaments.map((t) => (
                <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-primary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t.game}
                      </div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                        {t.name}
                      </h3>
                    </div>
                    <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)' }}>
                      {t.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={16} /> {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Users size={16} /> {t._count.players} / {t.maxPlayers} Players
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', display: 'flex', gap: '0.75rem' }}>
                    <Link href={`/admin/tournaments/${t.id}`} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                      Manage
                    </Link>
                    <button
                      onClick={() => setDeleteConfirm(t.id)}
                      className="btn btn-ghost"
                      style={{ color: '#ff4040', borderColor: 'rgba(255,64,64,0.3)', padding: '0 1rem' }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)} style={{ zIndex: 100 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: 16 }}>Delete Tournament?</h3>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>
              This will permanently delete this tournament, its players, and its bracket.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: '#ff4040', borderColor: '#ff4040' }} onClick={() => handleDelete(deleteConfirm)}>
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Tournament Modal */}
      {showCreate && (
        <div className="tourn-modal-overlay" onClick={() => setShowCreate(false)} style={{ zIndex: 100 }}>
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
