'use client';

import React, { useState } from 'react';

type Props = {
  initial?: {
    id?: string;
    title?: string;
    description?: string;
    prizeName?: string;
    startAt?: string | null;
    endAt?: string | null;
    status?: string;
  };
};

export default function AdminDrawForm({ initial }: Props) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [prizeName, setPrizeName] = useState(initial?.prizeName || '');
  const [startAt, setStartAt] = useState(initial?.startAt ? initial.startAt.substring(0,16) : '');
  const [endAt, setEndAt] = useState(initial?.endAt ? initial.endAt.substring(0,16) : '');
  const [status, setStatus] = useState(initial?.status || 'DRAFT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // default status for new draws should be ACTIVE; keep existing status when editing
      const payload: any = { title, description, prizeName, status: initial?.id ? status : (initial?.status || 'ACTIVE') };
      if (startAt) payload.startAt = new Date(startAt).toISOString();
      if (endAt) payload.endAt = new Date(endAt).toISOString();

      const method = initial?.id ? 'PATCH' : 'POST';
      const url = initial?.id ? `/api/admin/draws/${initial.id}` : '/api/admin/draws';

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');

      // Redirect to manage page for the draw
      const id = data.draw?.id ?? initial?.id;
      if (id) window.location.href = `/admin/draws/${id}`;
      else window.location.href = '/admin/draws';
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 8 }}>
        <label style={{ display: 'block', fontWeight: 600 }}>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" required />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: 'block', fontWeight: 600 }}>Prize Name</label>
        <input value={prizeName} onChange={(e) => setPrizeName(e.target.value)} className="input" />
      </div>

      {/* Prize Name is a free text field; passes are assigned manually by admins */}

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: 'block', fontWeight: 600 }}>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input" rows={4} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontWeight: 600 }}>Start (local)</label>
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="input" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontWeight: 600 }}>End (local)</label>
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="input" />
        </div>
      </div>

      {/* Status is set to ACTIVE by default when creating a new draw. Use the draw detail page to change status later. */}

      {error && <div style={{ color: 'var(--color-danger)', marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
        <a className="btn" href="/admin/draws">Cancel</a>
      </div>
    </form>
  );
}
