'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Swords, Check, RotateCcw, X, Shield } from 'lucide-react';

interface Player { id: string; name: string; }
interface Match {
  id: string;
  round: number;
  matchIndex: number;
  player1: Player | null;
  player2: Player | null;
  player1Id: string | null;
  player2Id: string | null;
  score1: number;
  score2: number;
  winner: Player | null;
  winnerId: string | null;
  status: string;
  isBye: boolean;
}
interface Tournament {
  id: string;
  name: string;
  bracketGenerated: boolean;
  matches: Match[];
}

const STATUS_CONFIG = {
  PENDING:     { label: 'Pending',     color: 'var(--color-text-muted)', dot: '○' },
  IN_PROGRESS: { label: 'In Progress', color: '#00d4ff',                 dot: '●' },
  COMPLETED:   { label: 'Completed',   color: '#00e676',                 dot: '✓' },
};

function getRoundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi Finals';
  if (fromEnd === 2) return 'Quarter Finals';
  if (fromEnd === 3) return 'Round of 16';
  if (fromEnd === 4) return 'Round of 32';
  if (fromEnd === 5) return 'Round of 64';
  return `Round ${round}`;
}

export default function MatchesPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [activeRound, setActiveRound] = useState<number | null>(null);

  useEffect(() => { fetchTournament(); }, [id]);

  const fetchTournament = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tournaments/${id}`);
    const data = await res.json();
    setTournament(data.tournament);
    // Auto-select first incomplete round
    if (data.tournament?.matches?.length > 0) {
      const firstIncompleteRound = [...data.tournament.matches]
        .filter((m: Match) => m.status !== 'COMPLETED' && !m.isBye)
        .sort((a: Match, b: Match) => a.round - b.round)[0]?.round;
      setActiveRound(firstIncompleteRound ?? data.tournament.matches[0]?.round);
    }
    setLoading(false);
  }, [id]);

  async function handleSaveResult() {
    if (!selectedMatch) return;
    setSaving(true);
    await fetch(`/api/tournaments/${id}/matches/${selectedMatch.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score1: parseInt(score1) || 0, score2: parseInt(score2) || 0 }),
    });
    setSaving(false);
    setSelectedMatch(null);
    fetchTournament();
  }

  async function handleReset() {
    if (!selectedMatch) return;
    setResetting(true);
    await fetch(`/api/tournaments/${id}/matches/${selectedMatch.id}/reset`, { method: 'POST' });
    setResetting(false);
    setSelectedMatch(null);
    fetchTournament();
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '4rem' }}><div className="tourn-spinner" /></div>;

  if (!tournament) return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>Not found</div>;

  if (!tournament.bracketGenerated) return (
    <div className="container" style={{ paddingTop: '3rem', textAlign: 'center' }}>
      <div className="card" style={{ maxWidth: '480px', margin: '0 auto', padding: '3rem' }}>
        <Shield size={40} style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }} />
        <h3 style={{ marginBottom: '0.75rem' }}>No Matches Yet</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
          Generate the bracket first to create matches.
        </p>
      </div>
    </div>
  );

  const rounds = Array.from(new Set(tournament.matches.map((m) => m.round))).sort((a, b) => a - b);
  const totalRounds = Math.max(...rounds);

  const displayMatches = tournament.matches
    .filter((m) => m.round === activeRound)
    .sort((a, b) => a.matchIndex - b.matchIndex);

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      {/* Round Tabs */}
      <div className="tourn-round-tabs">
        {rounds.map((r) => {
          const rMatches = tournament.matches.filter((m) => m.round === r);
          const completed = rMatches.filter((m) => m.status === 'COMPLETED').length;
          const total = rMatches.filter((m) => !m.isBye).length;
          return (
            <button
              key={r}
              onClick={() => setActiveRound(r)}
              className={`tourn-round-tab${activeRound === r ? ' active' : ''}`}
            >
              <span>{getRoundName(r, totalRounds)}</span>
              <span className="tourn-round-tab-count">{completed}/{total}</span>
            </button>
          );
        })}
      </div>

      {/* Match Cards */}
      <div className="tourn-matches-grid">
        {displayMatches.map((match) => {
          const statusCfg = STATUS_CONFIG[match.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING;
          const canClick = isAdmin && !match.isBye && (match.player1Id || match.player2Id);

          return (
            <div
              key={match.id}
              className={`tourn-match-card${canClick ? ' clickable' : ''}${match.isBye ? ' bye' : ''}`}
              onClick={() => canClick && (setSelectedMatch(match), setScore1(String(match.score1 || '')), setScore2(String(match.score2 || '')))}
            >
              <div className="tourn-match-header">
                <span style={{ fontSize: '0.75rem', fontFamily: 'Orbitron, sans-serif', color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>
                  Match {match.matchIndex + 1}
                </span>
                <span style={{ fontSize: '0.75rem', color: statusCfg.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {statusCfg.dot} {match.isBye ? 'BYE' : statusCfg.label}
                </span>
              </div>

              {/* P1 */}
              <div className={`tourn-match-player${match.winnerId === match.player1Id && match.status === 'COMPLETED' ? ' winner' : ''}${match.winnerId && match.winnerId !== match.player1Id && match.status === 'COMPLETED' ? ' loser' : ''}`}>
                <span className="tourn-match-player-name">{match.player1?.name ?? (match.isBye && !match.player1Id ? 'BYE' : '—')}</span>
                {match.status === 'COMPLETED' && <span className="tourn-match-score">{match.score1}</span>}
              </div>

              <div className="tourn-match-vs">
                <Swords size={14} style={{ color: 'var(--color-text-muted)' }} />
              </div>

              {/* P2 */}
              <div className={`tourn-match-player${match.winnerId === match.player2Id && match.status === 'COMPLETED' ? ' winner' : ''}${match.winnerId && match.winnerId !== match.player2Id && match.status === 'COMPLETED' ? ' loser' : ''}`}>
                <span className="tourn-match-player-name">{match.player2?.name ?? (match.isBye && !match.player2Id ? 'BYE' : '—')}</span>
                {match.status === 'COMPLETED' && <span className="tourn-match-score">{match.score2}</span>}
              </div>

              {match.status === 'COMPLETED' && match.winner && (
                <div className="tourn-match-winner-label">
                  <Check size={12} /> Winner: {match.winner.name}
                </div>
              )}

              {canClick && match.status !== 'COMPLETED' && (
                <div className="tourn-match-cta">Click to enter result</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Match Modal */}
      {selectedMatch && (
        <div className="tourn-modal-overlay" onClick={() => setSelectedMatch(null)}>
          <div className="tourn-modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="tourn-modal-header">
              <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '0.95rem' }}>Match Result</h2>
              <button onClick={() => setSelectedMatch(null)} className="tourn-modal-close"><X size={18} /></button>
            </div>

            <div style={{ padding: '1.25rem 0' }}>
              <div className="match-score-grid">
                <div className="match-score-player">
                  <div className="match-score-player-name">{selectedMatch.player1?.name ?? 'TBD'}</div>
                  <input type="number" value={score1} onChange={(e) => setScore1(e.target.value)} min="0" className="tourn-input match-score-input" placeholder="0" />
                </div>
                <div className="match-score-vs">VS</div>
                <div className="match-score-player">
                  <div className="match-score-player-name">{selectedMatch.player2?.name ?? 'TBD'}</div>
                  <input type="number" value={score2} onChange={(e) => setScore2(e.target.value)} min="0" className="tourn-input match-score-input" placeholder="0" />
                </div>
              </div>
            </div>

            <div className="tourn-modal-actions" style={{ justifyContent: 'space-between' }}>
              {selectedMatch.status === 'COMPLETED' && (
                <button onClick={handleReset} disabled={resetting} className="btn btn-ghost btn-sm" style={{ color: '#ff4040', borderColor: 'rgba(255,64,64,0.3)' }}>
                  <RotateCcw size={14} /> {resetting ? 'Resetting…' : 'Reset'}
                </button>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                <button onClick={() => setSelectedMatch(null)} className="btn btn-ghost btn-sm">Cancel</button>
                <button
                  onClick={handleSaveResult}
                  disabled={saving || score1 === '' || score2 === '' || parseInt(score1) === parseInt(score2)}
                  className="btn btn-primary btn-sm"
                >
                  <Check size={14} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
