'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Trophy, Calendar, Users, DollarSign, Zap,
  Lock, Unlock, Play, Check,
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
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  useEffect(() => { fetchTournament(); }, [id]);

  async function fetchTournament() {
    setLoading(true);
    const res = await fetch(`/api/tournaments/${id}`);
    const data = await res.json();
    setTournament(data.tournament);
    setLoading(false);
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
            <div className="tourn-champion-title">
              Tournament Champion
            </div>
            <div className="tourn-champion-name">
              {champion.name}
            </div>
            <div className="tourn-champion-runner-up">
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

    </div>
  );
}
