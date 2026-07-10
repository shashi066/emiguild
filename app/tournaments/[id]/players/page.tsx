'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Plus, Shuffle, Trash2, Edit3, Search, GripVertical, X, Check, User } from 'lucide-react';

interface Player {
  id: string;
  name: string;
  seed: number;
  userId?: string | null;
}

export default function PlayersPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchPlayers(); }, [id]);

  async function fetchPlayers() {
    setLoading(true);
    const res = await fetch(`/api/tournaments/${id}/players`);
    const data = await res.json();
    setPlayers(data.players || []);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;
    setAdding(true);
    const res = await fetch(`/api/tournaments/${id}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addName.trim() }),
    });
    if (res.ok) {
      setAddName('');
      fetchPlayers();
      addInputRef.current?.focus();
    }
    setAdding(false);
  }

  async function handleDelete(pid: string) {
    await fetch(`/api/tournaments/${id}/players/${pid}`, { method: 'DELETE' });
    fetchPlayers();
  }

  async function handleEdit(pid: string) {
    await fetch(`/api/tournaments/${id}/players/${pid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setEditingId(null);
    fetchPlayers();
  }

  async function handleShuffle() {
    setShuffling(true);
    const res = await fetch(`/api/tournaments/${id}/players/shuffle`, { method: 'POST' });
    const data = await res.json();
    setPlayers(data.players || []);
    setShuffling(false);
  }

  // Drag and drop handlers
  function handleDragStart(idx: number) { setDragIdx(idx); }
  function handleDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDragOverIdx(idx); }

  async function handleDrop(dropIdx: number) {
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }

    const reordered = [...players];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dropIdx, 0, moved);

    // Update seeds
    const updated = reordered.map((p, i) => ({ ...p, seed: i }));
    setPlayers(updated);
    setDragIdx(null);
    setDragOverIdx(null);

    // Persist new seeds
    await Promise.all(
      updated.map((p) =>
        fetch(`/api/tournaments/${id}/players/${p.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seed: p.seed }),
        })
      )
    );
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

        {isAdmin && (
          <button
            onClick={handleShuffle}
            disabled={shuffling || players.length < 2}
            className="btn btn-ghost btn-sm"
            style={{ color: '#a78bfa', borderColor: 'rgba(167,139,250,0.3)' }}
          >
            <Shuffle size={14} /> {shuffling ? 'Shuffling…' : 'Randomize Seeds'}
          </button>
        )}
      </div>

      {/* Add Player */}
      {isAdmin && (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input
              ref={addInputRef}
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Enter player name…"
              className="tourn-input"
              style={{ paddingLeft: '36px' }}
            />
          </div>
          <button type="submit" disabled={adding || !addName.trim()} className="btn btn-primary btn-sm">
            <Plus size={15} /> Add
          </button>
        </form>
      )}

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
          {players.length === 0 ? (isAdmin ? 'Add your first player above.' : 'No players registered yet.') : 'No players match your search.'}
        </div>
      ) : (
        <div className="tourn-player-list">
          {filtered.map((player, idx) => (
            <div
              key={player.id}
              className={`tourn-player-row${dragOverIdx === idx ? ' drag-over' : ''}${dragIdx === idx ? ' dragging' : ''}`}
              draggable={isAdmin && !search}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
            >
              {isAdmin && !search && (
                <div className="tourn-drag-handle">
                  <GripVertical size={16} />
                </div>
              )}

              <div className="tourn-seed-badge">
                #{player.seed + 1}
              </div>

              {editingId === player.id ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEdit(player.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                  className="tourn-input"
                  style={{ flex: 1, padding: '6px 10px', fontSize: '0.9rem' }}
                />
              ) : (
                <div className="tourn-player-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {player.name}
                  {session?.user?.id && player.userId === session.user.id && (
                    <span style={{ fontSize: '0.65rem', background: 'rgba(0,230,118,0.15)', color: '#00e676', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.05em' }}>YOU</span>
                  )}
                </div>
              )}

              {isAdmin && (
                <div className="tourn-player-actions">
                  {editingId === player.id ? (
                    <>
                      <button onClick={() => handleEdit(player.id)} className="tourn-icon-btn success"><Check size={15} /></button>
                      <button onClick={() => setEditingId(null)} className="tourn-icon-btn"><X size={15} /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditingId(player.id); setEditName(player.name); }} className="tourn-icon-btn"><Edit3 size={15} /></button>
                      <button onClick={() => handleDelete(player.id)} className="tourn-icon-btn danger"><Trash2 size={15} /></button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && players.length > 0 && !search && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: '1rem', textAlign: 'center' }}>
          Drag rows to reorder seeds. Seed #1 is the top seed.
        </p>
      )}
    </div>
  );
}
