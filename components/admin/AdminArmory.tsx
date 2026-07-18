'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Shield, Save, AlertCircle, RefreshCw, History } from 'lucide-react';

const REWARD_TYPES = ['PERCENT_DISCOUNT', 'FIXED_DISCOUNT', 'GAMING_MINUTES', 'RACING_MINUTES', 'SQUAD_NIGHT', 'BRONZE_PASS'];
function rewardTypeLabel(type: string) {
  switch (type) {
    case 'PERCENT_DISCOUNT': return 'Percent discount';
    case 'FIXED_DISCOUNT': return 'Fixed discount';
    case 'GAMING_MINUTES': return 'Gaming minutes';
    case 'RACING_MINUTES': return 'Racing minutes';
    case 'SQUAD_NIGHT': return 'Squad night';
    case 'BRONZE_PASS': return 'Bronze pass';
    default: return type;
  }
}

function rewardValue(reward: any) {
  switch (reward.rewardType) {
    case 'PERCENT_DISCOUNT': return reward.discountPercentage ?? '';
    case 'FIXED_DISCOUNT': return reward.discountAmount ?? '';
    case 'GAMING_MINUTES': return reward.gamingMinutes ?? '';
    case 'RACING_MINUTES': return reward.racingMinutes ?? '';
    case 'SQUAD_NIGHT': return reward.gamingMinutes ?? 60;
    case 'BRONZE_PASS': return reward.gamingMinutes ?? 600;
    default: return '';
  }
}

function rewardUnit(type: string) {
  switch (type) {
    case 'PERCENT_DISCOUNT': return '%';
    case 'FIXED_DISCOUNT': return '₹';
    case 'GAMING_MINUTES':
    case 'RACING_MINUTES':
    case 'SQUAD_NIGHT':
    case 'BRONZE_PASS':
      return 'min';
    default:
      return '';
  }
}

function rewardDescription(type: string, value: string | number) {
  const amount = Number(value || 0);
  switch (type) {
    case 'PERCENT_DISCOUNT': return `${amount}% off booking`;
    case 'FIXED_DISCOUNT': return `₹${amount} off booking`;
    case 'GAMING_MINUTES': return `${amount} free gaming minutes`;
    case 'RACING_MINUTES': return `${amount} free racing minutes`;
    case 'SQUAD_NIGHT': return 'Squad Night: 1 Hour Gaming for You + 3 Friends';
    case 'BRONZE_PASS': return 'Bronze Pass (10 Hours)';
    default: return 'Armory reward';
  }
}

function rewardPatchFor(type: string, value: string | number) {
  const numericValue = value === '' ? null : Number(value);
  return {
    rewardType: type,
    discountPercentage: type === 'PERCENT_DISCOUNT' ? numericValue : null,
    discountAmount: type === 'FIXED_DISCOUNT' ? numericValue : null,
    gamingMinutes: ['GAMING_MINUTES', 'SQUAD_NIGHT', 'BRONZE_PASS'].includes(type) ? numericValue : null,
    racingMinutes: type === 'RACING_MINUTES' ? numericValue : null,
    minimumBookingValue: null,
    maximumDiscount: null,
    eligibleStations: '',
    description: rewardDescription(type, numericValue ?? 0),
  };
}

function getTodayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

async function readJson(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function AdminArmory({ initialConfig, initialError = '' }: { initialConfig?: any; initialError?: string }) {
  const [settings, setSettings] = useState<any>(initialConfig?.settings ?? {});
  const [sets, setSets] = useState<any[]>(initialConfig?.sets ?? []);
  const [artifacts, setArtifacts] = useState<any[]>(initialConfig?.artifacts ?? []);
  const [rewards, setRewards] = useState<any[]>(initialConfig?.rewards ?? []);
  const [loading, setLoading] = useState(!initialConfig && !initialError);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(initialError);
  const [historyDate, setHistoryDate] = useState(getTodayIST());
  const [tickets, setTickets] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/armory/config');
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to load Artifacts config.');
      setSettings(data.settings ?? {});
      setSets(data.sets ?? []);
      setArtifacts(data.artifacts ?? []);
      setRewards(data.rewards ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to load Artifacts config.');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (date: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/armory/tickets?date=${encodeURIComponent(date)}`);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to load set history.');
      setTickets(data.tickets ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to load set history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!initialConfig) load();
    loadHistory(getTodayIST());
  }, []);

  const totalDrop = sets.filter((set) => set.active).reduce((sum, set) => sum + Number(set.dropPercentage || 0), 0);
  const slotTotals = sets.reduce((map, set) => {
    map[set.id] = artifacts
      .filter((artifact) => artifact.setId === set.id && artifact.active)
      .reduce((sum, artifact) => sum + Number(artifact.slotDropPercentage || 0), 0);
    return map;
  }, {} as Record<string, number>);
  const slotWeightsOk = sets.every((set) => !set.active || slotTotals[set.id] === 100);

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/armory/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, sets, artifacts, rewards }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to save Artifacts.');
      setSettings(data.settings ?? {});
      setSets(data.sets ?? []);
      setArtifacts(data.artifacts ?? []);
      setRewards(data.rewards ?? []);
      setMessage('Artifacts settings saved.');
    } catch (err: any) {
      setError(err.message || 'Failed to save Artifacts.');
    } finally {
      setSaving(false);
    }
  };

  const updateSet = (id: string, patch: any) => {
    setSets((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  const updateArtifact = (id: string, patch: any) => {
    setArtifacts((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  const updateReward = (setId: string, patch: any) => {
    setRewards((rows) => rows.map((row) => row.setId === setId ? { ...row, ...patch } : row));
  };

  if (loading) return <div className="loading-state"><div className="spinner" />Loading Artifacts admin...</div>;

  const tableCardStyle = { borderRadius: 8, minWidth: 0, maxWidth: '100%', overflow: 'hidden' } as const;
  const tableScrollStyle = {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    overflowX: 'scroll',
    overflowY: 'hidden',
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorX: 'contain',
    touchAction: 'pan-x',
    paddingBottom: 8,
  } as const;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Shield size={26} style={{ display: 'inline', marginRight: 10, color: '#c7b7ff' }} />
            Artifacts
          </h1>
          <p className="page-subtitle">Manage artifact drops, set rewards, and counter redemption.</p>
        </div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={load}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {message && <div className="alert alert-success" style={{ marginBottom: 'var(--space-lg)' }}><CheckCircle size={16} /> {message}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-lg)' }}><AlertCircle size={16} /> {error}</div>}

      <div style={{ display: 'grid', gap: 'var(--space-xl)' }}>
        <div className="card" style={{ borderRadius: 8 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 'var(--space-md)' }}>Forge Settings</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)' }}>
            <label>
              <span className="form-label">Daily Forge Enabled</span>
              <select className="form-input" value={settings.armory_enabled ?? 'true'} onChange={(e) => setSettings((s: any) => ({ ...s, armory_enabled: e.target.value }))}>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>
          </div>
        </div>

        <div className="card" style={{ borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
            <h2 style={{ fontSize: '1.2rem' }}>Drop Percentages</h2>
            <strong style={{ color: totalDrop === 100 ? 'var(--color-accent-success)' : '#ff8a8a' }}>Active total: {totalDrop}%</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)' }}>
            {sets.map((set) => (
              <div key={set.id} style={{ padding: 'var(--space-md)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <input type="checkbox" checked={set.active} onChange={(e) => updateSet(set.id, { active: e.target.checked })} />
                  <strong>{set.name}</strong>
                </label>
                <input className="form-input" type="number" min="0" max="100" value={set.dropPercentage} onChange={(e) => updateSet(set.id, { dropPercentage: Number(e.target.value) })} />
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ borderRadius: 8 }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 'var(--space-md)' }}>Artifact Availability & Slot Weights</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            {artifacts.map((artifact) => (
              <div key={artifact.id} style={{ display: 'grid', gap: 8, padding: 'var(--space-md)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
                  <input type="checkbox" checked={artifact.active} onChange={(e) => updateArtifact(artifact.id, { active: e.target.checked })} />
                  <span>
                    <strong>{artifact.name}</strong>
                    <span style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{artifact.set.name} - {artifact.slotType}</span>
                  </span>
                </label>
                <label>
                  <span className="form-label">Slot weight %</span>
                  <input className="form-input" type="number" min="0" max="100" value={artifact.slotDropPercentage ?? 0} onChange={(e) => updateArtifact(artifact.id, { slotDropPercentage: Number(e.target.value) })} />
                </label>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'var(--space-md)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sets.map((set) => (
              <span key={set.id} className="badge" style={{ color: slotTotals[set.id] === 100 ? 'var(--color-accent-success)' : '#ff8a8a' }}>
                {set.shortLabel}: {slotTotals[set.id] ?? 0}%
              </span>
            ))}
          </div>
        </div>

        <div className="card" style={tableCardStyle}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 'var(--space-md)' }}>Set Rewards</h2>
          <div style={tableScrollStyle}>
            <table style={{ width: 820, maxWidth: 'none', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: 'var(--space-sm)' }}>Set</th>
                  <th style={{ padding: 'var(--space-sm)' }}>Active</th>
                  <th style={{ padding: 'var(--space-sm)' }}>Type</th>
                  <th style={{ padding: 'var(--space-sm)' }}>Value</th>
                  <th style={{ padding: 'var(--space-sm)' }}>Weekday</th>
                  <th style={{ padding: 'var(--space-sm)' }}>Reward shown</th>
                </tr>
              </thead>
              <tbody>
                {rewards.map((reward) => {
                  const value = rewardValue(reward);
                  const preview = reward.description || rewardDescription(reward.rewardType, value);
                  return (
                    <tr key={reward.setId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: 'var(--space-sm)' }}>
                        <strong>{reward.set.name}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{reward.set.rarity}</div>
                      </td>
                      <td style={{ padding: 'var(--space-sm)' }}>
                        <input type="checkbox" checked={reward.active} onChange={(e) => updateReward(reward.setId, { active: e.target.checked })} />
                      </td>
                      <td style={{ padding: 'var(--space-sm)', minWidth: 180 }}>
                        <select
                          className="form-input"
                          value={reward.rewardType}
                          onChange={(e) => updateReward(reward.setId, rewardPatchFor(e.target.value, rewardValue(reward) || 0))}
                        >
                          {REWARD_TYPES.map((type) => <option key={type} value={type}>{rewardTypeLabel(type)}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: 'var(--space-sm)', minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {rewardUnit(reward.rewardType) === '₹' && <span style={{ color: 'var(--color-text-muted)' }}>₹</span>}
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            value={value}
                            onChange={(e) => updateReward(reward.setId, rewardPatchFor(reward.rewardType, e.target.value))}
                            style={{ minWidth: 86 }}
                          />
                          {rewardUnit(reward.rewardType) !== '₹' && <span style={{ color: 'var(--color-text-muted)' }}>{rewardUnit(reward.rewardType)}</span>}
                        </div>
                      </td>
                      <td style={{ padding: 'var(--space-sm)' }}>
                        <input type="checkbox" checked={reward.weekdayOnly} onChange={(e) => updateReward(reward.setId, { weekdayOnly: e.target.checked })} />
                      </td>
                      <td style={{ padding: 'var(--space-sm)', color: 'var(--color-text-secondary)' }}>{preview}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={tableCardStyle}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 'var(--space-md)' }}>
            <History size={18} style={{ display: 'inline', marginRight: 8 }} />
            Consumed Sets
          </h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-md)', alignItems: 'center' }}>
            <input className="form-input" type="date" value={historyDate} onChange={(e) => { setHistoryDate(e.target.value); loadHistory(e.target.value); }} style={{ maxWidth: 180 }} />
            <button className="btn btn-ghost btn-sm" type="button" disabled={historyLoading} onClick={() => loadHistory(historyDate)}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          {historyLoading ? (
            <div className="loading-state"><div className="spinner" />Loading history...</div>
          ) : tickets.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-lg)' }}>No sets consumed for this date.</p>
          ) : (
            <div style={tableScrollStyle}>
              <table style={{ width: 640, maxWidth: 'none', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: 'var(--space-sm)' }}>User</th>
                    <th style={{ padding: 'var(--space-sm)' }}>Set</th>
                    <th style={{ padding: 'var(--space-sm)' }}>Reward</th>
                    <th style={{ padding: 'var(--space-sm)' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => {
                    let reward: any = {};
                    try { reward = JSON.parse(ticket.rewardSnapshot); } catch {}
                    return (
                      <tr key={ticket.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: 'var(--space-sm)' }}>
                          <strong>{ticket.user?.name ?? '—'}</strong>
                          {ticket.user?.email && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{ticket.user.email}</div>}
                        </td>
                        <td style={{ padding: 'var(--space-sm)' }}>{ticket.set.name}</td>
                        <td style={{ padding: 'var(--space-sm)' }}>
                          <strong>{reward.description ?? 'Reward ticket'}</strong>
                        </td>
                        <td style={{ padding: 'var(--space-sm)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                          {new Date(ticket.claimedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {tickets.length} set{tickets.length !== 1 ? 's' : ''} consumed on {historyDate}
              </p>
            </div>
          )}
        </div>

        <button className="btn btn-primary" type="button" disabled={saving || totalDrop !== 100 || !slotWeightsOk} onClick={save} style={{ justifySelf: 'start' }}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save Artifacts'}
        </button>
      </div>
    </div>
  );
}
