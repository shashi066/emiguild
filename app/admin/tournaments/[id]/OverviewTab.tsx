'use client';

import { useState } from 'react';

export default function OverviewTab({ tournament, onRefresh }: { tournament: any, onRefresh: () => void }) {
  const [form, setForm] = useState(tournament);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/tournaments/${tournament.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    onRefresh();
  };

  const generateBracket = async () => {
    if (!confirm('Generate bracket? This will overwrite existing matches.')) return;
    setGenerating(true);
    await fetch(`/api/tournaments/${tournament.id}/bracket`, { method: 'POST' });
    setGenerating(false);
    onRefresh();
  };

  return (
    <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 300px' }}>
      <div className="card" style={{ padding: '2rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Edit Details</h3>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Tournament Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="tourn-input" required />
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Game</label>
              <input type="text" value={form.game} onChange={(e) => setForm({ ...form, game: e.target.value })} className="tourn-input" required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="tourn-input">
                <option value="REGISTRATION_OPEN">Registration Open</option>
                <option value="REGISTRATION_CLOSED">Registration Closed</option>
                <option value="ONGOING">Ongoing</option>
                <option value="FINISHED">Finished</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Entry Fee</label>
              <input type="text" value={form.entryFee} onChange={(e) => setForm({ ...form, entryFee: e.target.value })} className="tourn-input" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Prize Pool</label>
              <input type="text" value={form.prizePool} onChange={(e) => setForm({ ...form, prizePool: e.target.value })} className="tourn-input" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: '1rem' }} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      <div className="card" style={{ padding: '2rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', height: 'fit-content' }}>
        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Bracket Generation</h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
          {tournament.bracketGenerated 
            ? 'A bracket has already been generated. Regenerating will reset all matches and scores.'
            : 'Generate the bracket once all players have joined.'}
        </p>
        <button onClick={generateBracket} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={generating}>
          {generating ? 'Generating...' : (tournament.bracketGenerated ? 'Regenerate Bracket' : 'Generate Bracket')}
        </button>
      </div>
    </div>
  );
}