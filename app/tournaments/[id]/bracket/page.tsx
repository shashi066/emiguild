'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Trophy, X, Check, RotateCcw, Zap } from 'lucide-react';

interface Player { id: string; name: string; seed: number; }
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
  game: string;
  status: string;
  bracketGenerated: boolean;
  players: Player[];
  matches: Match[];
}

const ROUND_NAMES: Record<number, string> = {
  1: 'Round 1', 2: 'Round 2', 3: 'Round 3', 4: 'Round 4',
  5: 'Quarter Finals', 6: 'Semi Finals', 7: 'Final',
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

export default function BracketPage() {
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
  const [champion, setChampion] = useState<Player | null>(null);
  const [showChampion, setShowChampion] = useState(false);

  useEffect(() => { fetchTournament(); }, [id]);

  const fetchTournament = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tournaments/${id}`);
    const data = await res.json();
    const t: Tournament = data.tournament;
    setTournament(t);
    setLoading(false);

    // Detect champion
    if (t && t.status === 'FINISHED' && t.matches.length > 0) {
      const totalRounds = Math.max(...t.matches.map((m) => m.round));
      const finalMatch = t.matches.find((m) => m.round === totalRounds);
      if (finalMatch?.winner) {
        setChampion(finalMatch.winner);
        setShowChampion(true);
      }
    }
  }, [id]);

  async function handleSaveResult() {
    if (!selectedMatch) return;
    setSaving(true);
    const s1 = parseInt(score1) || 0;
    const s2 = parseInt(score2) || 0;
    await fetch(`/api/tournaments/${id}/matches/${selectedMatch.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score1: s1, score2: s2 }),
    });
    setSaving(false);
    setSelectedMatch(null);
    fetchTournament();
  }

  async function handleResetMatch() {
    if (!selectedMatch) return;
    setResetting(true);
    await fetch(`/api/tournaments/${id}/matches/${selectedMatch.id}/reset`, { method: 'POST' });
    setResetting(false);
    setSelectedMatch(null);
    fetchTournament();
  }

  function openMatch(match: Match) {
    if (!isAdmin || match.isBye || (!match.player1Id && !match.player2Id)) return;
    setSelectedMatch(match);
    setScore1(String(match.score1 || ''));
    setScore2(String(match.score2 || ''));
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem' }}><div className="tourn-spinner" /></div>
  );

  if (!tournament) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>Tournament not found</div>
  );

  if (!tournament.bracketGenerated) return (
    <div className="container" style={{ paddingTop: '3rem', textAlign: 'center' }}>
      <div className="card" style={{ maxWidth: '480px', margin: '0 auto', padding: '3rem' }}>
        <Zap size={40} style={{ color: 'var(--color-accent-primary)', marginBottom: '1rem' }} />
        <h3 style={{ fontFamily: 'Orbitron, sans-serif', marginBottom: '0.75rem' }}>Bracket Not Generated</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
          {isAdmin
            ? 'Go to the Overview tab and click "Generate Bracket" to create the knockout bracket.'
            : 'The bracket will be available once the admin generates it.'}
        </p>
      </div>
    </div>
  );

  const rounds = Array.from(new Set(tournament.matches.map((m) => m.round))).sort((a, b) => a - b);
  const totalRounds = Math.max(...rounds);

  return (
    <div style={{ paddingTop: '1.5rem' }}>
      {/* Champion Overlay */}
      {showChampion && champion && (
        <div className="tourn-modal-overlay" onClick={() => setShowChampion(false)}>
          <div className="tourn-champion-modal" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowChampion(false)} className="tourn-modal-close" style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
              <X size={18} />
            </button>
            <div className="tourn-champion-trophy-anim">🏆</div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '0.75rem', color: '#FFD700', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Tournament Champion
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#FFD700', textShadow: '0 0 40px rgba(255,215,0,0.6)', marginBottom: '0.5rem' }}>
              {champion.name}
            </div>
            <div style={{ color: 'rgba(255,215,0,0.6)', fontSize: '0.9rem' }}>🎉 Congratulations!</div>
          </div>
        </div>
      )}

      {/* Bracket */}
      <div className="bracket-scroll-container">
        <div className="bracket-wrapper">
          {rounds.map((round) => {
            const roundMatches = tournament.matches
              .filter((m) => m.round === round)
              .sort((a, b) => a.matchIndex - b.matchIndex);

            return (
              <div key={round} className="bracket-round">
                <div className="bracket-round-label">
                  {getRoundName(round, totalRounds)}
                </div>
                <div className="bracket-matches">
                  {roundMatches.map((match, mIdx) => {
                    const isLastRound = round === totalRounds;
                    const hasPlayers = match.player1Id || match.player2Id;
                    const isCompleted = match.status === 'COMPLETED';
                    const isInProgress = match.status === 'IN_PROGRESS';
                    const canClick = isAdmin && !match.isBye && hasPlayers;

                    // Compute connector spacing: each match occupies 2^(round-1) slots
                    const spacingMultiplier = Math.pow(2, round - 1);
                    const matchHeight = 120; // px per match slot
                    const totalHeight = spacingMultiplier * matchHeight;

                    return (
                      <div
                        key={match.id}
                        className="bracket-match-wrapper"
                        style={{ height: totalHeight }}
                      >
                        {/* Connector lines (not on last round) */}
                        {round < totalRounds && (
                          <div className="bracket-connector">
                            <div className="bracket-connector-line bracket-connector-top" />
                            <div className="bracket-connector-line bracket-connector-bottom" />
                            <div className="bracket-connector-line bracket-connector-mid" />
                          </div>
                        )}

                        <div
                          className={`bracket-match-card${isCompleted ? ' completed' : ''}${isInProgress ? ' in-progress' : ''}${match.isBye ? ' bye' : ''}${canClick ? ' clickable' : ''}${isLastRound ? ' final-match' : ''}`}
                          onClick={() => canClick && openMatch(match)}
                        >
                          {isLastRound && (
                            <div className="bracket-final-badge">
                              <Trophy size={10} /> FINAL
                            </div>
                          )}

                          {/* Player 1 Row */}
                          <div className={`bracket-player-row${match.winnerId === match.player1Id && isCompleted ? ' winner' : ''}${match.winnerId && match.winnerId !== match.player1Id && isCompleted ? ' loser' : ''}`}>
                            <span className="bracket-player-name">
                              {match.player1?.name ?? (match.isBye && !match.player1Id ? 'BYE' : '—')}
                            </span>
                            {isCompleted && (
                              <span className="bracket-score">{match.score1}</span>
                            )}
                          </div>

                          {/* Divider */}
                          <div className="bracket-divider" />

                          {/* Player 2 Row */}
                          <div className={`bracket-player-row${match.winnerId === match.player2Id && isCompleted ? ' winner' : ''}${match.winnerId && match.winnerId !== match.player2Id && isCompleted ? ' loser' : ''}`}>
                            <span className="bracket-player-name">
                              {match.player2?.name ?? (match.isBye && !match.player2Id ? 'BYE' : '—')}
                            </span>
                            {isCompleted && (
                              <span className="bracket-score">{match.score2}</span>
                            )}
                          </div>

                          {/* Status footer */}
                          {!match.isBye && (
                            <div className="bracket-match-status">
                              {isCompleted ? (
                                <span style={{ color: '#00e676' }}>✓ {match.winner?.name ?? 'Completed'}</span>
                              ) : isInProgress ? (
                                <span style={{ color: '#00d4ff' }}>● Live</span>
                              ) : (
                                <span style={{ color: 'var(--color-text-muted)' }}>{canClick ? 'Click to enter result' : 'Pending'}</span>
                              )}
                            </div>
                          )}

                          {match.isBye && (
                            <div className="bracket-match-status">
                              <span style={{ color: 'var(--color-text-muted)' }}>BYE — Auto advance</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Champion display at the end */}
          {tournament.status === 'FINISHED' && champion && (
            <div className="bracket-round">
              <div className="bracket-round-label" style={{ color: '#FFD700' }}>Champion</div>
              <div className="bracket-matches" style={{ justifyContent: 'center' }}>
                <div className="bracket-match-wrapper" style={{ height: 120 }}>
                  <div className="bracket-champion-card">
                    <div style={{ fontSize: '1.5rem' }}>🏆</div>
                    <div className="bracket-champion-name">{champion.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,215,0,0.6)', fontFamily: 'Orbitron, sans-serif', letterSpacing: '0.1em' }}>WINNER</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Match Result Modal */}
      {selectedMatch && (
        <div className="tourn-modal-overlay" onClick={() => setSelectedMatch(null)}>
          <div className="tourn-modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="tourn-modal-header">
              <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '0.95rem' }}>
                Enter Match Result
              </h2>
              <button onClick={() => setSelectedMatch(null)} className="tourn-modal-close"><X size={18} /></button>
            </div>

            <div style={{ padding: '1.25rem 0' }}>
              <div className="match-score-grid">
                <div className="match-score-player">
                  <div className="match-score-player-name">{selectedMatch.player1?.name ?? 'TBD'}</div>
                  <input
                    type="number"
                    value={score1}
                    onChange={(e) => setScore1(e.target.value)}
                    min="0"
                    className="tourn-input match-score-input"
                    placeholder="0"
                  />
                </div>
                <div className="match-score-vs">VS</div>
                <div className="match-score-player">
                  <div className="match-score-player-name">{selectedMatch.player2?.name ?? 'TBD'}</div>
                  <input
                    type="number"
                    value={score2}
                    onChange={(e) => setScore2(e.target.value)}
                    min="0"
                    className="tourn-input match-score-input"
                    placeholder="0"
                  />
                </div>
              </div>

              {parseInt(score1) === parseInt(score2) && score1 !== '' && (
                <p style={{ color: '#ffaa00', fontSize: '0.8rem', textAlign: 'center', marginTop: '0.75rem' }}>
                  ⚠ Tie — a clear winner is needed to advance
                </p>
              )}
            </div>

            <div className="tourn-modal-actions" style={{ justifyContent: 'space-between' }}>
              {selectedMatch.status === 'COMPLETED' && (
                <button onClick={handleResetMatch} disabled={resetting} className="btn btn-ghost btn-sm" style={{ color: '#ff4040', borderColor: 'rgba(255,64,64,0.3)' }}>
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
                  <Check size={14} /> {saving ? 'Saving…' : 'Save Result'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
