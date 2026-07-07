'use client';

import { useEffect, useState } from 'react';
import { Gamepad2, Plus, Trash2, Edit2, X, GripVertical } from 'lucide-react';

type Game = {
  id: string;
  name: string;
  category: string;
  position: number;
  isActive: boolean;
};

const CATEGORIES = [
  'Single-Player Adventures',
  'Multiplayer, Co-op & Competitive',
  'Racing & Simulator Experience',
];

type FormData = {
  name: string;
  category: string;
  position: string;
};

const EMPTY_FORM: FormData = {
  name: '',
  category: 'Single-Player Adventures',
  position: '0',
};

export default function AdminGamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editGame, setEditGame] = useState<Game | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchGames = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/games');
      const data = await res.json();
      setGames(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames();
  }, []);

  const openAdd = () => {
    setEditGame(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  };

  const openEdit = (game: Game) => {
    setEditGame(game);
    setForm({
      name: game.name,
      category: game.category,
      position: String(game.position),
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        position: parseInt(form.position) || 0,
      };

      const res = await fetch('/api/games', {
        method: editGame ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editGame ? { ...payload, id: editGame.id } : payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save game');
      }

      setShowModal(false);
      fetchGames();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/games?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete game');
      }
      setDeleteConfirm(null);
      fetchGames();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  // Group games by category
  const groupedGames = games.reduce((acc, game) => {
    if (!acc[game.category]) acc[game.category] = [];
    acc[game.category].push(game);
    return acc;
  }, {} as Record<string, Game[]>);

  return (
    <div className="page-shell">
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div className="section-tag">
              <Gamepad2 size={14} />
              Game Library
            </div>
            <h1 className="section-title">
              Manage <span className="text-gradient">Available Games</span>
            </h1>
            <p className="section-description">
              Add, edit, or remove games from the public game library.
            </p>
          </div>

          <div style={{ marginBottom: 'var(--space-xl)', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={openAdd} className="btn btn-primary">
              <Plus size={18} />
              Add Game
            </button>
          </div>

          {loading ? (
            <div className="card" style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading games...
            </div>
          ) : games.length === 0 ? (
            <div className="card" style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Gamepad2 size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
              <p>No games yet. Add your first game to get started.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
              {CATEGORIES.map((category) => {
                const categoryGames = groupedGames[category] || [];
                if (categoryGames.length === 0) return null;

                return (
                  <div key={category} className="card">
                    <div className="games-category-badge" style={{ marginBottom: 'var(--space-lg)' }}>
                      <Gamepad2 size={16} />
                      {category}
                      <span style={{ marginLeft: 'auto', fontSize: '0.875rem', opacity: 0.7 }}>
                        {categoryGames.length} games
                      </span>
                    </div>
                    <ul className="games-list" style={{ gap: 'var(--space-sm)' }}>
                      {categoryGames.map((game) => (
                        <li key={game.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-sm) var(--space-md)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                          <span>{game.name}</span>
                          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                            <button
                              onClick={() => openEdit(game)}
                              className="btn btn-ghost"
                              style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.75rem' }}
                            >
                              <Edit2 size={14} />
                              Edit
                            </button>
                            {deleteConfirm === game.id ? (
                              <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                                <button
                                  onClick={() => handleDelete(game.id)}
                                  className="btn btn-primary"
                                  style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.75rem', background: '#ef4444' }}
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="btn btn-ghost"
                                  style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.75rem' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(game.id)}
                                className="btn btn-ghost"
                                style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.75rem', color: '#ef4444' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                {editGame ? 'Edit Game' : 'Add New Game'}
              </h2>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost" style={{ padding: 'var(--space-xs)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
              {error && (
                <div style={{ padding: 'var(--space-md)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: '0.875rem' }}>
                  {error}
                </div>
              )}

              <div>
                <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', fontWeight: 500 }}>
                  Game Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Black Myth: Wukong"
                  required
                  style={{
                    width: '100%',
                    padding: 'var(--space-sm) var(--space-md)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', fontWeight: 500 }}>
                  Category *
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: 'var(--space-sm) var(--space-md)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text)',
                    fontSize: '0.875rem',
                  }}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', fontWeight: 500 }}>
                  Display Order
                </label>
                <input
                  type="number"
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  placeholder="0"
                  min="0"
                  style={{
                    width: '100%',
                    padding: 'var(--space-sm) var(--space-md)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text)',
                    fontSize: '0.875rem',
                  }}
                />
                <p style={{ marginTop: 'var(--space-xs)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Lower numbers appear first within each category.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end', marginTop: 'var(--space-md)' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editGame ? 'Update Game' : 'Add Game'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}