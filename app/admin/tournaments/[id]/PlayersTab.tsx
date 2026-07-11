'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Shuffle, Trash2, Edit3, X, Check, Search, User } from 'lucide-react';
import { decryptPhone } from '@/lib/crypto';

interface Player {
  id: string;
  name: string;
  phone?: string | null;
  seed: number;
}

type UserItem = { id: string; name: string; email: string; phone: string | null };

export default function PlayersTab({ tournament, players, fetchPlayers }: { tournament: any, players: Player[], fetchPlayers: () => void }) {
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [adding, setAdding] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [allUsers, setAllUsers] = useState<UserItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    fetch('/api/admin/passes/users')
      .then((r) => r.json())
      .then((d) => setAllUsers((d.users ?? []).map((u: any) => ({ ...u, phone: decryptPhone(u.phone) }))))
      .catch(() => setAllUsers([]));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredUsers = addName.trim().length === 0 ? [] : allUsers.filter((u) => {
    const q = addName.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone ?? '').includes(q);
  }).slice(0, 5);

  const handleSelectUser = (user: UserItem) => {
    setAddName(user.name);
    setAddPhone(user.phone || '');
    setSelectedUserId(user.id);
    setShowDropdown(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) return;
    setAdding(true);
    await fetch(`/api/tournaments/${tournament.id}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addName.trim(), phone: addPhone.trim(), userId: selectedUserId }),
    });
    setAddName('');
    setAddPhone('');
    setSelectedUserId(null);
    setAdding(false);
    fetchPlayers();
  };

  const handleDelete = async (pid: string) => {
    await fetch(`/api/tournaments/${tournament.id}/players/${pid}`, { method: 'DELETE' });
    fetchPlayers();
  };

  const handleEdit = async (pid: string) => {
    await fetch(`/api/tournaments/${tournament.id}/players/${pid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim() }),
    });
    setEditingId(null);
    fetchPlayers();
  };

  const handleShuffle = async () => {
    if (!confirm('Shuffle all player seeds randomly?')) return;
    setShuffling(true);
    await fetch(`/api/tournaments/${tournament.id}/players/shuffle`, { method: 'POST' });
    setShuffling(false);
    fetchPlayers();
  };

  return (
    <div>
      <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'var(--color-bg-card)' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Add Player</h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }} ref={wrapperRef}>
          <div style={{ flex: 1, position: 'relative' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Name (Search User or type manually)</label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
              <input 
                type="text" 
                value={addName} 
                onChange={e => {
                  setAddName(e.target.value);
                  setSelectedUserId(null); // Clear selected user if they keep typing
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                className="tourn-input" 
                style={{ paddingLeft: '32px' }}
                placeholder="Search by name, email or phone..."
                required 
              />
            </div>

            {showDropdown && filteredUsers.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: '6px', zIndex: 50, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                {filteredUsers.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => handleSelectUser(u)}
                    style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(167,139,250,0.1)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <User size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{u.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{u.email} {u.phone && `• ${u.phone}`}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Phone (Optional)</label>
            <input type="text" value={addPhone} onChange={e => setAddPhone(e.target.value)} className="tourn-input" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={adding}>
            <Plus size={18} /> Add
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem' }}>Participants ({players.length}/{tournament.maxPlayers})</h3>
        <button onClick={handleShuffle} className="btn btn-ghost" disabled={shuffling || players.length === 0} style={{ border: '1px solid var(--color-border)' }}>
          <Shuffle size={16} /> Shuffle Seeds
        </button>
      </div>

      <div style={{ background: 'var(--color-bg-card)', borderRadius: '12px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '1rem', width: '60px', color: 'var(--color-text-secondary)' }}>Seed</th>
              <th style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>Name</th>
              <th style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>Phone Number</th>
              <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--color-text-secondary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>No players joined yet.</td>
              </tr>
            ) : (
              players.sort((a, b) => a.seed - b.seed).map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>#{p.seed}</td>
                  
                  {editingId === p.id ? (
                    <td style={{ padding: '0.5rem 1rem' }}>
                      <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="tourn-input" style={{ padding: '0.25rem 0.5rem', minHeight: 'auto' }} />
                    </td>
                  ) : (
                    <td style={{ padding: '1rem', fontWeight: 500, color: tournament.winnerId === p.id ? '#FFD700' : 'inherit' }}>
                      {p.name} {tournament.winnerId === p.id && '👑 (Winner)'}
                    </td>
                  )}

                  {editingId === p.id ? (
                    <td style={{ padding: '0.5rem 1rem' }}>
                      <input type="text" value={editPhone} onChange={e => setEditPhone(e.target.value)} className="tourn-input" style={{ padding: '0.25rem 0.5rem', minHeight: 'auto' }} />
                    </td>
                  ) : (
                    <td style={{ padding: '1rem', color: p.phone ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                      {p.phone || '—'}
                    </td>
                  )}

                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    {editingId === p.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleEdit(p.id)} className="btn btn-ghost" style={{ padding: '4px' }}><Check size={16} color="#00e676" /></button>
                        <button onClick={() => setEditingId(null)} className="btn btn-ghost" style={{ padding: '4px' }}><X size={16} color="#ff4040" /></button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => { setEditingId(p.id); setEditName(p.name); setEditPhone(p.phone || ''); }} className="btn btn-ghost" style={{ padding: '4px' }}>
                          <Edit3 size={16} />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="btn btn-ghost" style={{ padding: '4px', color: '#ff4040' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
