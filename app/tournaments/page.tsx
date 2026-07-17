'use client';

import './tournament.css';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trophy, Users, Calendar, Zap, ChevronRight, Gamepad2, ArrowLeft } from 'lucide-react';
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
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

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
              <div className="tourn-page-eyebrow" style={{ fontSize: '0.8rem', fontFamily: 'Orbitron, sans-serif', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '4px' }}>
                EmiGuild Esports
              </div>
              <h1 className="tourn-page-title" style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 800, fontFamily: 'Orbitron, sans-serif' }}>
                Tournaments
              </h1>
            </div>
          </div>
          <p style={{ color: 'var(--color-text-secondary)', maxWidth: '500px', fontSize: '1rem' }}>
            Compete against the best. Climb the bracket. Claim the crown.
          </p>
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
              Check back soon for upcoming events.
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
                    <div className="tourn-stat tourn-stat--reward">
                      <div className="tourn-stat-pill">Winner Reward</div>
                      <div className="tourn-stat-val tourn-stat-val--reward">
                        {t.prizePool || 'Reward TBA'}
                      </div>
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
    </div>
  );
}
