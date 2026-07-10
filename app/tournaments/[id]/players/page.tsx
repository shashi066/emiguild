'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Search, User } from 'lucide-react';

interface Player {
  id: string;
  name: string;
  seed: number;
  userId?: string | null;
}

export default function PlayersPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchPlayers(); }, [id]);

  async function fetchPlayers() {
    setLoading(true);
    const res = await fetch(`/api/tournaments/${id}/players`);
    const data = await res.json();
    setPlayers(data.players || []);
    setLoading(false);
  }

  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1rem', color: 'var(--color-text-secondary)', letterSpacing: '0.1em' }}>
            PLAYER ROSTER
          </h2>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
            {players.length} player{players.length !== 1 ? 's' : ''} registered
          </div>
        </div>
      </div>

      {/* Search */}
      {players.length > 5 && (
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players…"
            className="tourn-input"
            style={{ paddingLeft: '36px' }}
          />
        </div>
      )}

      {/* Player List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}><div className="tourn-spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
          {players.length === 0 ? 'No players registered yet.' : 'No players match your search.'}
        </div>
      ) : (
        <div className="tourn-player-list">
          {filtered.map((player) => (
            <div
              key={player.id}
              className={`tourn-player-row`}
            >
              <div className="tourn-seed-badge">
                #{player.seed + 1}
              </div>

              <div className="tourn-player-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {player.name}
                {session?.user?.id && player.userId === session.user.id && (
                  <span style={{ fontSize: '0.65rem', background: 'rgba(0,230,118,0.15)', color: '#00e676', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.05em' }}>YOU</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
