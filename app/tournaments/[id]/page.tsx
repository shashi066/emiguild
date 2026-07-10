'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Trophy, Calendar, Users, DollarSign, Zap, Edit3, Trash2,
  Lock, Unlock, Play, RotateCcw, X, Check,
} from 'lucide-react';
import Loading from './loading';

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
  _count: { players: number };
  players: { id: string; name: string; seed: number; userId: string | null }[];
  matches: { id: string; round: number; status: string; winnerId: string | null }[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  REGISTRATION_OPEN: { label: 'Registration Open', color: '#00e676', bg: 'rgba(0,230,118,0.12)', icon: <Unlock size={14} /> },
  REGISTRATION_CLOSED: { label: 'Registration Closed', color: '#ffaa00', bg: 'rgba(255,170,0,0.12)', icon: <Lock size={14} /> },
  ONGOING: { label: 'Ongoing', color: '#00d4ff', bg: 'rgba(0,212,255,0.12)', icon: <Play size={14} /> },
  FINISHED: { label: 'Finished', color: '#FFD700', bg: 'rgba(255,215,0,0.08)', icon: <Trophy size={14} /> },
};

export default function TournamentOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', game: '', date: '', entryFee: '', prizePool: '', maxPlayers: '', status: '' });
  const [saving, setSaving] = useState(false);
  const [generatingBracket, setGeneratingBracket] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => { fetchTournament(); }, [id]);

  async function fetchTournament() {
    setLoading(true);
    const res = await fetch(`/api/tournaments/${id}`);
    const data = await res.json();
    setTournament(data.tournament);
    if (data.tournament) {
      setEditForm({
        name: data.tournament.name,
        game: data.tournament.game,
        date: data.tournament.date,
        entryFee: data.tournament.entryFee || 'Free',
        prizePool: data.tournament.prizePool || '',
        maxPlayers: String(data.tournament.maxPlayers),
        status: data.tournament.status,
      });
    }
    setLoading(false);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/tournaments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        game: editForm.game,
        date: editForm.date,
        entryFee: editForm.entryFee || 'Free',
        prizePool: editForm.prizePool,
        maxPlayers: parseInt(editForm.maxPlayers) || 16,
        status: editForm.status,
      }),
    });
    setSaving(false);
    setEditing(false);
    fetchTournament();
  }

  async function handleStatusChange(newStatus: string) {
    await fetch(`/api/tournaments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchTournament();
  }

  async function handleGenerateBracket() {
    setGeneratingBracket(true);
    const res = await fetch(`/api/tournaments/${id}/bracket`, { method: 'POST' });
    if (res.ok) {
      router.push(`/tournaments/${id}/bracket`);
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to generate bracket');
    }
    setGeneratingBracket(false);
  }

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/tournaments/${id}`, { method: 'DELETE' });
    router.push('/tournaments');
  }

  async function handleRegister() {
    setRegistering(true);
    setRegError(null);
    const res = await fetch(`/api/tournaments/${id}/register`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json();
      setRegError(data.error || 'Failed to register');
    } else {
      fetchTournament();
    }
    setRegistering(false);
  }

  async function handleWithdraw() {
    if (!confirm('Are you sure you want to withdraw from this tournament?')) return;
    setRegistering(true);
    setRegError(null);
    const res = await fetch(`/api/tournaments/${id}/register`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setRegError(data.error || 'Failed to withdraw');
    } else {
      fetchTournament();
    }
    setRegistering(false);
  }

  if (loading) return <Loading />;

  if (!tournament) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
      Tournament not found
    </div>
  );

  const statusCfg = STATUS_CONFIG[tournament.status] || STATUS_CONFIG.REGISTRATION_OPEN;
  const totalMatches = tournament.matches.length;
  const completedMatches = tournament.matches.filter((m) => m.status === 'COMPLETED').length;
  const champion = tournament.status === 'FINISHED'
    ? tournament.players.find((p) => {
      const finalMatch = tournament.matches.find((m) => m.round === Math.max(...tournament.matches.map((x) => x.round)));
      return finalMatch?.winnerId === p.id;
    })
    : null;

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      {/* Champion Banner */}
      {champion && (
        <div className="tourn-champion-banner">
          <div className="tourn-champion-glow" />
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏆</div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '0.75rem', color: '#FFD700', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              Tournament Champion
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#FFD700', textShadow: '0 0 30px rgba(255,215,0,0.5)' }}>
              {champion.name}
            </div>
            <div style={{ color: 'rgba(255,215,0,0.6)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              🥈 Runner-up: {tournament.players.find((p) => {
                const finalMatch = tournament.matches.find((m) => m.round === Math.max(...tournament.matches.map((x) => x.round)));
                return finalMatch && p.id !== champion.id && (finalMatch.winnerId === champion.id) &&
                  (finalMatch as any).player1Id === p.id || (finalMatch as any).player2Id === p.id;
              })?.name || '—'}
            </div>
          </div>
        </div>
      )}

      {/* User Registration Actions */}
      {session?.user && tournament.status === 'REGISTRATION_OPEN' && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          {tournament.players.some((p) => p.userId === session.user.id) ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#00e676', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                <Check size={16} /> You are registered!
              </div>
              {!tournament.bracketGenerated && (
                <button onClick={handleWithdraw} disabled={registering} className="btn btn-ghost btn-sm" style={{ color: '#ff4040', borderColor: 'rgba(255,64,64,0.3)' }}>
                  {registering ? 'Processing...' : 'Withdraw'}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleRegister}
              disabled={registering || tournament._count.players >= tournament.maxPlayers}
              className="btn btn-primary"
              style={{ width: '100%', maxWidth: '300px', fontSize: '1rem', padding: '0.75rem', background: 'linear-gradient(135deg, #6c63ff 0%, #4facfe 100%)' }}
            >
              {registering ? 'Registering...' : tournament._count.players >= tournament.maxPlayers ? 'Tournament Full' : 'Register Now'}
            </button>
          )}
          {regError && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: '8px', fontSize: '0.85rem', width: '100%', maxWidth: '300px', textAlign: 'center' }}>
              {regError}
            </div>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="tourn-stats-grid">
        <div className="tourn-stat-card">
          <div className="tourn-stat-icon" style={{ color: '#6c63ff' }}><Calendar size={20} /></div>
          <div className="tourn-stat-info">
            <div className="tourn-stat-label">Date</div>
            <div className="tourn-stat-value">{new Date(tournament.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </div>
        </div>
        <div className="tourn-stat-card">
          <div className="tourn-stat-icon" style={{ color: '#00d4ff' }}><Users size={20} /></div>
          <div className="tourn-stat-info">
            <div className="tourn-stat-label">Players</div>
            <div className="tourn-stat-value">{tournament._count.players} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>/ {tournament.maxPlayers}</span></div>
          </div>
        </div>
        <div className="tourn-stat-card">
          <div className="tourn-stat-icon" style={{ color: '#FFD700' }}><Trophy size={20} /></div>
          <div className="tourn-stat-info">
            <div className="tourn-stat-label">Winner Reward</div>
            <div className="tourn-stat-value">{tournament.prizePool || '—'}</div>
          </div>
        </div>
        <div className="tourn-stat-card">
          <div className="tourn-stat-icon" style={{ color: '#00e676' }}><DollarSign size={20} /></div>
          <div className="tourn-stat-info">
            <div className="tourn-stat-label">Entry Fee</div>
            <div className="tourn-stat-value">{tournament.entryFee || 'Free'}</div>
          </div>
        </div>
        <div className="tourn-stat-card">
          <div className="tourn-stat-icon" style={{ color: '#ff2d55' }}><Zap size={20} /></div>
          <div className="tourn-stat-info">
            <div className="tourn-stat-label">Status</div>
            <div className="tourn-stat-value" style={{ color: statusCfg.color, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {statusCfg.icon} {statusCfg.label}
            </div>
          </div>
        </div>
        {tournament.bracketGenerated && (
          <div className="tourn-stat-card">
            <div className="tourn-stat-icon" style={{ color: '#a78bfa' }}><Zap size={20} /></div>
            <div className="tourn-stat-info">
              <div className="tourn-stat-label">Progress</div>
              <div className="tourn-stat-value">{completedMatches}/{totalMatches} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>matches</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Admin Controls */}
      {isAdmin && (
        <div className="card" style={{ marginTop: '1.5rem', padding: '1.5rem' }}>
          <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem', letterSpacing: '0.1em' }}>
            ADMIN CONTROLS
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button onClick={() => setEditing(true)} className="btn btn-ghost btn-sm"><Edit3 size={14} /> Edit Details</button>

            {tournament.status === 'REGISTRATION_OPEN' && (
              <button onClick={() => handleStatusChange('REGISTRATION_CLOSED')} className="btn btn-ghost btn-sm" style={{ color: '#ffaa00', borderColor: 'rgba(255,170,0,0.3)' }}>
                <Lock size={14} /> Close Registration
              </button>
            )}
            {tournament.status === 'REGISTRATION_CLOSED' && (
              <button onClick={() => handleStatusChange('REGISTRATION_OPEN')} className="btn btn-ghost btn-sm" style={{ color: '#00e676', borderColor: 'rgba(0,230,118,0.3)' }}>
                <Unlock size={14} /> Open Registration
              </button>
            )}

            {!tournament.bracketGenerated && tournament._count.players >= 2 && (
              <button onClick={handleGenerateBracket} disabled={generatingBracket} className="btn btn-primary btn-sm">
                <Zap size={14} /> {generatingBracket ? 'Generating…' : 'Generate Bracket'}
              </button>
            )}
            {tournament.bracketGenerated && (
              <button onClick={handleGenerateBracket} disabled={generatingBracket} className="btn btn-ghost btn-sm" style={{ color: '#ff4040', borderColor: 'rgba(255,64,64,0.3)' }}>
                <RotateCcw size={14} /> {generatingBracket ? 'Regenerating…' : 'Regenerate Bracket'}
              </button>
            )}

            <button onClick={() => setShowDeleteConfirm(true)} className="btn btn-ghost btn-sm" style={{ color: '#ff4040', borderColor: 'rgba(255,64,64,0.3)', marginLeft: 'auto' }}>
              <Trash2 size={14} /> Delete Tournament
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="tourn-modal-overlay" onClick={() => setEditing(false)}>
          <div className="tourn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tourn-modal-header">
              <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1rem' }}>Edit Tournament</h2>
              <button onClick={() => setEditing(false)} className="tourn-modal-close"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="tourn-form">
              <div className="tourn-form-group">
                <label>Tournament Name</label>
                <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="tourn-input" required />
              </div>
              <div className="tourn-form-row">
                <div className="tourn-form-group">
                  <label>Game</label>
                  <select value={editForm.game} onChange={(e) => setEditForm({ ...editForm, game: e.target.value })} className="tourn-input">
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
                  <label>Date</label>
                  <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="tourn-input" required />
                </div>
              </div>
              <div className="tourn-form-row">
                <div className="tourn-form-group">
                  <label>Entry Fee</label>
                  <input type="text" value={editForm.entryFee} onChange={(e) => setEditForm({ ...editForm, entryFee: e.target.value })} placeholder="Free / ₹100" className="tourn-input" />
                </div>
                <div className="tourn-form-group">
                  <label>Winner Reward / Prize Pool</label>
                  <input type="text" value={editForm.prizePool} onChange={(e) => setEditForm({ ...editForm, prizePool: e.target.value })} placeholder="₹500 cash / Trophy" className="tourn-input" />
                </div>
              </div>
              <div className="tourn-form-row">
                <div className="tourn-form-group">
                  <label>Max Players</label>
                  <select value={editForm.maxPlayers} onChange={(e) => setEditForm({ ...editForm, maxPlayers: e.target.value })} className="tourn-input">
                    {[4, 8, 16, 32, 64].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="tourn-form-group">
                  <label>Status</label>
                  <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="tourn-input">
                    <option value="REGISTRATION_OPEN">Registration Open</option>
                    <option value="REGISTRATION_CLOSED">Registration Closed</option>
                    <option value="ONGOING">Ongoing</option>
                    <option value="FINISHED">Finished</option>
                  </select>
                </div>
              </div>
              <div className="tourn-modal-actions">
                <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}><Check size={14} /> {saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="tourn-modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="tourn-modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="tourn-modal-header">
              <h2 style={{ color: '#ff4040', fontFamily: 'Orbitron, sans-serif', fontSize: '1rem' }}>Delete Tournament?</h2>
              <button onClick={() => setShowDeleteConfirm(false)} className="tourn-modal-close"><X size={18} /></button>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', margin: '1rem 0 1.5rem', fontSize: '0.9rem' }}>
              This will permanently delete <strong style={{ color: '#fff' }}>{tournament.name}</strong> and all its players and match data. This cannot be undone.
            </p>
            <div className="tourn-modal-actions">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="btn btn-ghost" style={{ color: '#ff4040', borderColor: 'rgba(255,64,64,0.4)' }}>
                <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
