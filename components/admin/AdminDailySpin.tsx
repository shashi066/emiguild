'use client';

import { useState, useEffect } from 'react';
import { Gift, Save, Plus, Trash2, Edit, CheckCircle, AlertCircle, RefreshCw, History } from 'lucide-react';
import { decryptNumber } from '@/lib/crypto';

type LootItem = {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  weight: number;
  enabled: boolean;
  rarity: string | null;
};

type SpinRecord = {
  id: string;
  spinDate: string;
  attempts: number;
  createdAt: string;
  user:     { name: string | null; email: string | null };
  lootItem: { name: string; rarity: string | null; description: string | null } | null;
};

const RARITY_COLORS: Record<string, string> = {
  LEGENDARY: '#f59e0b',
  EPIC:      '#a855f7',
  RARE:      '#3b82f6',
  UNCOMMON:  '#22c55e',
  COMMON:    '#9ca3af',
};

function getTodayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function AdminDailySpin() {
  const [items, setItems] = useState<LootItem[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Spin history state
  const [history, setHistory] = useState<SpinRecord[]>([]);
  const [historyDate, setHistoryDate] = useState(getTodayIST());
  const [historyLoading, setHistoryLoading] = useState(false);

  // Item Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<LootItem>>({
    name: '', description: '', iconUrl: '', weight: 10, enabled: true, rarity: 'COMMON'
  });

  const loadHistory = async (date: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/daily-spin/history?date=${date}`);
      const data = await res.json();
      setHistory(data.spins || []);
    } catch {
      // silently fail
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsRes, settingsRes] = await Promise.all([
        fetch('/api/admin/daily-spin/items'),
        fetch('/api/admin/settings')
      ]);
      const itemsData = await itemsRes.json();
      const settingsData = await settingsRes.json();
      
      setItems((itemsData.items || []).map((item: any) => ({
        ...item,
        weight: decryptNumber(item.weight) ?? 0,
      })));
      
      const map: Record<string, string> = {};
      (settingsData.settings || []).forEach((s: any) => { map[s.key] = s.value; });
      setSettings(map);
    } catch (err) {
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); loadHistory(getTodayIST()); }, []);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setError('');
    setSuccess('');
    try {
      const payload = [
        { key: 'daily_spin_enabled', value: settings.daily_spin_enabled ?? 'true' },
        { key: 'daily_spin_retries_enabled', value: settings.daily_spin_retries_enabled ?? 'false' },
        { key: 'daily_spin_max_retries', value: settings.daily_spin_max_retries ?? '1' },
        { key: 'daily_spin_reset_hour', value: settings.daily_spin_reset_hour ?? '0' },
      ];
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Error saving settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const method = editingId ? 'PATCH' : 'POST';
      const url = editingId ? `/api/admin/daily-spin/items/${editingId}` : '/api/admin/daily-spin/items';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (!res.ok) throw new Error('Failed to save item');
      
      setSuccess('Item saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
      setIsEditing(false);
      setEditingId(null);
      setFormData({ name: '', description: '', iconUrl: '', weight: 10, enabled: true, rarity: 'COMMON' });
      loadData();
    } catch (err) {
      setError('Error saving item.');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await fetch(`/api/admin/daily-spin/items/${id}`, { method: 'DELETE' });
      setSuccess('Item deleted.');
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch (err) {
      setError('Error deleting item.');
    }
  };

  const editItem = (item: LootItem) => {
    setFormData(item);
    setEditingId(item.id);
    setIsEditing(true);
  };

  const totalWeight = items.reduce((sum, item) => sum + (item.enabled ? item.weight : 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Gift size={26} style={{ display: 'inline', marginRight: 10, color: 'var(--color-accent-tertiary)' }} />
            Daily Loot Spin
          </h1>
          <p className="page-subtitle">Manage Daily Guild Spin settings and rewards</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadData}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {success && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-lg)' }}>
          <CheckCircle size={16} /> {success}
        </div>
      )}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-lg)' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state"><div className="spinner" />Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          
          {/* Settings Card */}
          <div className="card">
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 'var(--space-md)' }}>Global Settings</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)' }}>
              
              <div>
                <label className="form-label">Enable Daily Guild Spin</label>
                <select
                  className="form-input"
                  value={settings.daily_spin_enabled || 'true'}
                  onChange={e => setSettings(s => ({ ...s, daily_spin_enabled: e.target.value }))}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>

              <div>
                <label className="form-label">Reset Hour (IST 0-23)</label>
                <input
                  type="number"
                  className="form-input"
                  min="0" max="23"
                  value={settings.daily_spin_reset_hour || '0'}
                  onChange={e => setSettings(s => ({ ...s, daily_spin_reset_hour: e.target.value }))}
                />
              </div>

              <div>
                <label className="form-label">Allow Retries?</label>
                <select
                  className="form-input"
                  value={settings.daily_spin_retries_enabled || 'false'}
                  onChange={e => setSettings(s => ({ ...s, daily_spin_retries_enabled: e.target.value }))}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>

              <div>
                <label className="form-label">Max Retries</label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  value={settings.daily_spin_max_retries || '1'}
                  onChange={e => setSettings(s => ({ ...s, daily_spin_max_retries: e.target.value }))}
                  disabled={settings.daily_spin_retries_enabled === 'false'}
                />
              </div>

            </div>
            <div style={{ marginTop: 'var(--space-md)' }}>
              <button className="btn btn-primary" onClick={handleSaveSettings} disabled={savingSettings}>
                <Save size={16} /> {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>

          {/* Items Management */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Loot Items</h2>
              {!isEditing && (
                <button className="btn btn-secondary btn-sm" onClick={() => setIsEditing(true)}>
                  <Plus size={16} /> Add Item
                </button>
              )}
            </div>

            {isEditing && (
              <div style={{ padding: 'var(--space-md)', background: 'var(--color-bg-surface)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)' }}>
                <h3 style={{ marginBottom: 'var(--space-md)' }}>{editingId ? 'Edit Item' : 'New Item'}</h3>
                <form onSubmit={handleSaveItem} style={{ display: 'grid', gap: 'var(--space-sm)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                    <div>
                      <label className="form-label">Name</label>
                      <input required className="form-input" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label">Rarity</label>
                      <select className="form-input" value={formData.rarity || 'COMMON'} onChange={e => setFormData({ ...formData, rarity: e.target.value })}>
                        <option value="COMMON">Common</option>
                        <option value="UNCOMMON">Uncommon</option>
                        <option value="RARE">Rare</option>
                        <option value="EPIC">Epic</option>
                        <option value="LEGENDARY">Legendary</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Description</label>
                    <input className="form-input" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-sm)' }}>
                    <div>
                      <label className="form-label">Icon URL (optional)</label>
                      <input className="form-input" value={formData.iconUrl || ''} onChange={e => setFormData({ ...formData, iconUrl: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label">Weight</label>
                      <input type="number" required min="1" className="form-input" value={formData.weight || 1} onChange={e => setFormData({ ...formData, weight: parseInt(e.target.value) })} />
                    </div>
                    <div>
                      <label className="form-label">Enabled</label>
                      <select className="form-input" value={formData.enabled ? 'true' : 'false'} onChange={e => setFormData({ ...formData, enabled: e.target.value === 'true' })}>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                    <button type="submit" className="btn btn-primary"><Save size={16} /> Save Item</button>
                    <button type="button" className="btn btn-ghost" onClick={() => { setIsEditing(false); setEditingId(null); setFormData({ name: '', weight: 10, enabled: true, rarity: 'COMMON' }); }}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: 'var(--space-sm)' }}>Name</th>
                    <th style={{ padding: 'var(--space-sm)' }}>Rarity</th>
                    <th style={{ padding: 'var(--space-sm)' }}>Weight</th>
                    <th style={{ padding: 'var(--space-sm)' }}>Drop Rate</th>
                    <th style={{ padding: 'var(--space-sm)' }}>Status</th>
                    <th style={{ padding: 'var(--space-sm)', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const dropRate = item.enabled && totalWeight > 0 ? ((item.weight / totalWeight) * 100).toFixed(2) + '%' : '0.00%';
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: 'var(--space-sm)' }}>
                          <strong>{item.name}</strong>
                          {item.description && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{item.description}</div>}
                        </td>
                        <td style={{ padding: 'var(--space-sm)' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', background: 'var(--color-bg-surface)' }}>{item.rarity}</span>
                        </td>
                        <td style={{ padding: 'var(--space-sm)' }}>{item.weight}</td>
                        <td style={{ padding: 'var(--space-sm)' }}>{dropRate}</td>
                        <td style={{ padding: 'var(--space-sm)' }}>
                          {item.enabled ? <span style={{ color: 'var(--color-accent-success)' }}>Active</span> : <span style={{ color: 'var(--color-text-muted)' }}>Disabled</span>}
                        </td>
                        <td style={{ padding: 'var(--space-sm)', textAlign: 'right' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => editItem(item)} style={{ display: 'inline-flex', padding: 4 }}><Edit size={16} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteItem(item.id)} style={{ display: 'inline-flex', padding: 4, color: 'var(--color-accent-danger)' }}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>

          {/* Spin History */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <History size={20} /> Spin History
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: 'auto' }}
                  value={historyDate}
                  onChange={e => { setHistoryDate(e.target.value); loadHistory(e.target.value); }}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => loadHistory(historyDate)}>
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {historyLoading ? (
              <div className="loading-state"><div className="spinner" />Loading history...</div>
            ) : history.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-lg)' }}>No spins recorded for this date.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: 'var(--space-sm)' }}>User</th>
                      <th style={{ padding: 'var(--space-sm)' }}>Reward Won</th>
                      <th style={{ padding: 'var(--space-sm)' }}>Rarity</th>
                      <th style={{ padding: 'var(--space-sm)' }}>Attempts</th>
                      <th style={{ padding: 'var(--space-sm)' }}>Time (IST)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(spin => (
                      <tr key={spin.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: 'var(--space-sm)' }}>
                          <strong>{spin.user.name ?? '—'}</strong>
                          {spin.user.email && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{spin.user.email}</div>}
                        </td>
                        <td style={{ padding: 'var(--space-sm)' }}>
                          {spin.lootItem ? (
                            <>
                              <strong>{spin.lootItem.name}</strong>
                              {spin.lootItem.description && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{spin.lootItem.description}</div>}
                            </>
                          ) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                        </td>
                        <td style={{ padding: 'var(--space-sm)' }}>
                          {spin.lootItem?.rarity ? (
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.78rem', fontWeight: 600, background: `${RARITY_COLORS[spin.lootItem.rarity] ?? '#9ca3af'}22`, color: RARITY_COLORS[spin.lootItem.rarity] ?? '#9ca3af' }}>
                              {spin.lootItem.rarity}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: 'var(--space-sm)' }}>{spin.attempts}</td>
                        <td style={{ padding: 'var(--space-sm)', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                          {new Date(spin.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {history.length} spin{history.length !== 1 ? 's' : ''} on {historyDate}
                </p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
