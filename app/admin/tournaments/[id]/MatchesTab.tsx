'use client';

import { useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';

interface Match {
  id: string;
  round: number;
  matchIndex: number;
  player1Id: string | null;
  player2Id: string | null;
  score1: number | null;
  score2: number | null;
  winnerId: string | null;
  status: string;
  player1: { id: string, name: string } | null;
  player2: { id: string, name: string } | null;
}

export default function MatchesTab({ tournament, matches, fetchMatches }: { tournament: any, matches: Match[], fetchMatches: () => void }) {
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEditClick = (m: Match) => {
    setEditingMatch(m);
    setScore1(m.score1 !== null ? String(m.score1) : '0');
    setScore2(m.score2 !== null ? String(m.score2) : '0');
  };

  const handleSaveMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMatch) return;
    setSaving(true);
    await fetch(`/api/tournaments/${tournament.id}/matches/${editingMatch.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score1: parseInt(score1), score2: parseInt(score2) }),
    });
    setSaving(false);
    setEditingMatch(null);
    fetchMatches();
  };

  const handleResetMatch = async (mId: string) => {
    if (!confirm('Reset this match? This will clear scores and might affect subsequent rounds.')) return;
    await fetch(`/api/tournaments/${tournament.id}/matches/${mId}/reset`, { method: 'POST' });
    if (editingMatch?.id === mId) setEditingMatch(null);
    fetchMatches();
  };

  const maxRound = Math.max(...matches.map(m => m.round), 0);
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

  return (
    <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: editingMatch ? '1fr 350px' : '1fr' }}>
      <div>
        {!tournament.bracketGenerated ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-text-secondary)' }}>Bracket has not been generated yet.</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>Go to Overview to generate it.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {rounds.map(roundNum => {
              const roundMatches = matches.filter(m => m.round === roundNum).sort((a, b) => a.matchIndex - b.matchIndex);
              return (
                <div key={roundNum}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                    {roundNum === maxRound ? 'Final' : roundNum === maxRound - 1 && maxRound > 2 ? 'Semi-Finals' : `Round ${roundNum}`}
                  </h3>
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {roundMatches.map(m => (
                      <div key={m.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--color-bg-card)', border: editingMatch?.id === m.id ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: m.winnerId === m.player1Id ? '#FFD700' : 'inherit' }}>
                            <span>{m.player1?.name || 'TBD'}</span>
                            <span style={{ fontWeight: 800 }}>{m.score1 !== null ? m.score1 : '-'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: m.winnerId === m.player2Id ? '#FFD700' : 'inherit' }}>
                            <span>{m.player2?.name || 'TBD'}</span>
                            <span style={{ fontWeight: 800 }}>{m.score2 !== null ? m.score2 : '-'}</span>
                          </div>
                        </div>
                        
                        <div style={{ marginLeft: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <button onClick={() => handleEditClick(m)} className="btn btn-ghost" style={{ padding: '0.25rem 1rem', fontSize: '0.8rem' }} disabled={!m.player1Id || !m.player2Id}>
                            Update Score
                          </button>
                          {(m.score1 !== null || m.score2 !== null) && (
                            <button onClick={() => handleResetMatch(m.id)} className="btn btn-ghost" style={{ padding: '0.25rem 1rem', fontSize: '0.8rem', color: '#ff4040' }}>
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editingMatch && (
        <div className="card" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', height: 'fit-content', position: 'sticky', top: '100px' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Update Score</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
            Round {editingMatch.round} - Match {editingMatch.matchIndex + 1}
          </p>
          <form onSubmit={handleSaveMatch} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>{editingMatch.player1?.name || 'Player 1'} Score</label>
              <input type="number" min="0" value={score1} onChange={e => setScore1(e.target.value)} className="tourn-input" required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>{editingMatch.player2?.name || 'Player 2'} Score</label>
              <input type="number" min="0" value={score2} onChange={e => setScore2(e.target.value)} className="tourn-input" required />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" onClick={() => setEditingMatch(null)} className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={saving}>
                <Save size={16} /> Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
