"use client";

import React, { useState } from 'react';

export default function ChangeDrawStatus({ drawId, current }: { drawId: string; current?: string }) {
  const [status, setStatus] = useState(current || 'DRAFT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/draws/${drawId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update status');
      // show saved indicator briefly; keep control editable
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleChange} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
        <option value="DRAFT">Draft</option>
        <option value="ACTIVE">Active</option>
        <option value="COMPLETED">Completed</option>
        <option value="CANCELLED">Cancelled</option>
      </select>
      <button type="submit" className="btn btn-sm" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
      {saved && <div style={{ color: 'var(--color-success)', marginLeft: 8 }}>Saved</div>}
      {error && <div style={{ color: 'var(--color-danger)', marginLeft: 8 }}>{error}</div>}
    </form>
  );
}
