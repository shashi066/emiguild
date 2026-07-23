'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { CheckCircle, Shield, Save, AlertCircle, RefreshCw, History, Package, Search } from 'lucide-react';
import { decryptNumber } from '@/lib/crypto';

const REWARD_TYPES = ['PERCENT_DISCOUNT', 'FIXED_DISCOUNT', 'GAMING_MINUTES', 'RACING_MINUTES', 'SQUAD_NIGHT', 'BRONZE_PASS'];
type HistoryType = 'drops' | 'sets' | 'inventory' | 'marketplace';
const AdminArmoryMarketplace = dynamic(
  () => import('@/components/admin/AdminArmoryMarketplace')
    .then((module) => module.AdminArmoryMarketplace),
  {
    loading: () => (
      <div className="loading-state">
        <div className="spinner" />
        Loading Artifact Exchange administration...
      </div>
    ),
  },
);
const INVENTORY_RARITY_ORDER: Record<string, number> = { PLATINUM: 0, GOLD: 1, SILVER: 2, BRONZE: 3 };
const ARMORY_RARITY_COLORS: Record<string, string> = {
  PLATINUM: '#c7a7ff',
  GOLD: '#f4cf58',
  SILVER: '#8edbed',
  BRONZE: '#d58a52',
};

function slotTypeLabel(slotType: string) {
  return slotType.charAt(0) + slotType.slice(1).toLowerCase();
}
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

function decryptArmoryAdminConfig(config: any) {
  return {
    ...config,
    sets: (config?.sets ?? []).map((set: any) => ({
      ...set,
      dropPercentage: decryptNumber(set.dropPercentage) ?? Number(set.dropPercentage ?? 0),
    })),
    artifacts: (config?.artifacts ?? []).map((artifact: any) => ({
      ...artifact,
      slotDropPercentage: decryptNumber(artifact.slotDropPercentage) ?? Number(artifact.slotDropPercentage ?? 0),
      set: artifact.set
        ? {
          ...artifact.set,
          dropPercentage: decryptNumber(artifact.set.dropPercentage) ?? Number(artifact.set.dropPercentage ?? 0),
        }
        : artifact.set,
    })),
    rewards: (config?.rewards ?? []).map((reward: any) => ({
      ...reward,
      set: reward.set
        ? {
          ...reward.set,
          dropPercentage: decryptNumber(reward.set.dropPercentage) ?? Number(reward.set.dropPercentage ?? 0),
        }
        : reward.set,
    })),
  };
}

export function AdminArmory({ initialConfig, initialError = '' }: { initialConfig?: any; initialError?: string }) {
  const decryptedInitialConfig = initialConfig ? decryptArmoryAdminConfig(initialConfig) : null;
  const [settings, setSettings] = useState<any>(decryptedInitialConfig?.settings ?? {});
  const [sets, setSets] = useState<any[]>(decryptedInitialConfig?.sets ?? []);
  const [artifacts, setArtifacts] = useState<any[]>(decryptedInitialConfig?.artifacts ?? []);
  const [rewards, setRewards] = useState<any[]>(decryptedInitialConfig?.rewards ?? []);
  const [loading, setLoading] = useState(!initialConfig && !initialError);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(initialError);
  const [historyDate, setHistoryDate] = useState(getTodayIST());
  const [historyType, setHistoryType] = useState<HistoryType>('drops');
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyRequestRef = useRef(0);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/armory/config');
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to load Artifacts config.');
      const config = decryptArmoryAdminConfig(data);
      setSettings(config.settings ?? {});
      setSets(config.sets ?? []);
      setArtifacts(config.artifacts ?? []);
      setRewards(config.rewards ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to load Artifacts config.');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (date: string, type: HistoryType) => {
    const requestId = ++historyRequestRef.current;
    setHistoryLoading(true);
    try {
      const query = new URLSearchParams({ date, type });
      const res = await fetch(`/api/admin/armory/history?${query}`);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to load Artifacts history.');
      if (requestId === historyRequestRef.current) setHistoryRows(data.rows ?? []);
    } catch (err: any) {
      if (requestId === historyRequestRef.current) setError(err.message || 'Failed to load Artifacts history.');
    } finally {
      if (requestId === historyRequestRef.current) setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!initialConfig) load();
    loadHistory(getTodayIST(), 'drops');
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
      const config = decryptArmoryAdminConfig(data);
      setSettings(config.settings ?? {});
      setSets(config.sets ?? []);
      setArtifacts(config.artifacts ?? []);
      setRewards(config.rewards ?? []);
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
            Artifacts Activity
          </h2>
          <div role="tablist" aria-label="Artifacts history type" style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-md)', borderBottom: '1px solid var(--color-border)', overflowX: 'auto' }}>
            {([
              ['drops', 'Daily Drops'],
              ['sets', 'Consumed Sets'],
              ['inventory', 'User Inventory'],
              ['marketplace', 'Artifact Exchange'],
            ] as const).map(([type, label]) => (
              <button
                key={type}
                className={`btn btn-sm ${historyType === type ? 'btn-primary' : 'btn-ghost'}`}
                type="button"
                role="tab"
                aria-selected={historyType === type}
                onClick={() => {
                  if (historyType === type) return;
                  setHistoryType(type);
                  setHistoryRows([]);
                  if (type === 'drops' || type === 'sets') {
                    loadHistory(historyDate, type);
                  }
                }}
                style={{ flexShrink: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
              >
                {label}
              </button>
            ))}
          </div>
          {historyType === 'inventory' ? (
            <UserInventoryHistory sets={sets} />
          ) : historyType === 'marketplace' ? (
            <AdminArmoryMarketplace />
          ) : (
            <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-md)', alignItems: 'center' }}>
            <input className="form-input" type="date" value={historyDate} onChange={(e) => { setHistoryDate(e.target.value); loadHistory(e.target.value, historyType); }} style={{ maxWidth: 180 }} />
            <button className="btn btn-ghost btn-sm" type="button" disabled={historyLoading} onClick={() => loadHistory(historyDate, historyType)}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          {historyLoading ? (
            <div className="loading-state"><div className="spinner" />Loading history...</div>
          ) : historyRows.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-lg)' }}>
              {historyType === 'drops' ? 'No artifacts collected for this date.' : 'No sets consumed for this date.'}
            </p>
          ) : (
            <div style={tableScrollStyle}>
              <table style={{ width: historyType === 'drops' ? 600 : 720, maxWidth: 'none', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: 'var(--space-sm)' }}>User</th>
                    {historyType === 'drops' ? (
                      <>
                        <th style={{ padding: 'var(--space-sm)' }}>Artifact</th>
                        <th style={{ padding: 'var(--space-sm)' }}>Slot</th>
                      </>
                    ) : (
                      <>
                        <th style={{ padding: 'var(--space-sm)' }}>Set</th>
                        <th style={{ padding: 'var(--space-sm)' }}>Reward</th>
                      </>
                    )}
                    <th style={{ padding: 'var(--space-sm)' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row) => {
                    if (historyType === 'drops') {
                      const source = row.claimDate?.includes(':checkin:') ? 'Check-in' : 'Forge';
                      return (
                        <tr key={row.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: 'var(--space-sm)' }}>
                            <strong>{row.user?.name ?? '—'}</strong>
                            {row.user?.email && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{row.user.email}</div>}
                          </td>
                          <td style={{ padding: 'var(--space-sm)' }}>
                            <strong style={{ color: ARMORY_RARITY_COLORS[row.artifact.set.rarity] ?? 'var(--color-text-primary)' }}>{row.artifact.name}</strong>
                            <div style={{ fontSize: '0.78rem', color: ARMORY_RARITY_COLORS[row.artifact.set.rarity] ?? 'var(--color-text-muted)' }}>{row.artifact.set.rarity} · {source}</div>
                          </td>
                          <td style={{ padding: 'var(--space-sm)' }}>{slotTypeLabel(row.artifact.slotType)}</td>
                          <td style={{ padding: 'var(--space-sm)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                            {new Date(row.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      );
                    }
                    let reward: any = {};
                    try { reward = JSON.parse(row.rewardSnapshot); } catch {}
                    return (
                      <tr key={row.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: 'var(--space-sm)' }}>
                          <strong>{row.user?.name ?? '—'}</strong>
                          {row.user?.email && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{row.user.email}</div>}
                        </td>
                        <td style={{ padding: 'var(--space-sm)' }}>
                          <strong style={{ color: ARMORY_RARITY_COLORS[reward.setRarity] ?? 'var(--color-text-primary)' }}>{row.set.name}</strong>
                          {reward.setRarity && <div style={{ fontSize: '0.78rem', color: ARMORY_RARITY_COLORS[reward.setRarity] }}>{reward.setRarity}</div>}
                        </td>
                        <td style={{ padding: 'var(--space-sm)' }}>
                          <strong>{reward.description ?? 'Reward ticket'}</strong>
                        </td>
                        <td style={{ padding: 'var(--space-sm)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                          {new Date(row.claimedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {historyRows.length} {historyType === 'drops' ? `artifact${historyRows.length !== 1 ? 's' : ''} collected` : `set${historyRows.length !== 1 ? 's' : ''} consumed`} on {historyDate}
              </p>
            </div>
          )}
            </>
          )}
        </div>

        <button className="btn btn-primary" type="button" disabled={saving || totalDrop !== 100 || !slotWeightsOk} onClick={save} style={{ justifySelf: 'start' }}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save Artifacts'}
        </button>
      </div>
    </div>
  );
}

function UserInventoryHistory({ sets }: { sets: any[] }) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [error, setError] = useState('');
  const searchRequestRef = useRef(0);

  useEffect(() => {
    const query = search.trim();
    const requestId = ++searchRequestRef.current;
    if (query.length < 2) {
      setUsers([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ type: 'users', search: query });
        const res = await fetch(`/api/admin/armory/history?${params}`);
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || 'Failed to search users.');
        if (requestId === searchRequestRef.current) setUsers(data.users ?? []);
      } catch (err: any) {
        if (requestId === searchRequestRef.current) setError(err.message || 'Failed to search users.');
      } finally {
        if (requestId === searchRequestRef.current) setSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const loadInventory = async (userId: string) => {
    setInventoryLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ type: 'inventory', userId });
      const res = await fetch(`/api/admin/armory/history?${params}`);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to load user inventory.');
      setInventory(data.inventory);
      setUsers([]);
    } catch (err: any) {
      setError(err.message || 'Failed to load user inventory.');
    } finally {
      setInventoryLoading(false);
    }
  };

  const items = inventory?.armoryInventory ?? [];
  const totalItems = items.reduce((sum: number, row: any) => sum + Number(row.quantity || 0), 0);
  const quantityBySetAndSlot = new Map<string, number>(
    items.map((row: any) => [`${row.artifact.set.name}:${row.artifact.slotType}`, Number(row.quantity || 0)]),
  );
  const inventorySets = sets
    .slice()
    .sort((a: any, b: any) => {
      const rarityDifference = (INVENTORY_RARITY_ORDER[a.rarity] ?? 99) - (INVENTORY_RARITY_ORDER[b.rarity] ?? 99);
      return rarityDifference || Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
    });

  return (
    <div>
      <label className="form-label" htmlFor="armory-user-search">Find user</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 520 }}>
        <Search size={18} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
        <input
          id="armory-user-search"
          className="form-input"
          type="search"
          value={search}
          placeholder="Type user name or email"
          autoComplete="off"
          onChange={(event) => {
            setSearch(event.target.value);
            setInventory(null);
            setError('');
          }}
          style={{ width: '100%' }}
        />
      </div>

      {error && <div style={{ color: 'var(--color-error)', marginTop: 'var(--space-sm)' }}>{error}</div>}
      {searching && <div className="loading-state" style={{ padding: 'var(--space-md)' }}><div className="spinner" />Searching users...</div>}

      {!searching && search.trim().length >= 2 && users.length > 0 && (
        <div style={{ display: 'grid', marginTop: 'var(--space-sm)', maxWidth: 620 }}>
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => loadInventory(user.id)}
              style={{ display: 'grid', gap: 2, padding: '8px 4px', textAlign: 'left', color: 'var(--color-text-primary)', background: 'transparent', border: 0, borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
            >
              <strong>{user.name}</strong>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{user.email}</span>
            </button>
          ))}
        </div>
      )}

      {!searching && search.trim().length >= 2 && users.length === 0 && !inventory && !error && (
        <p style={{ color: 'var(--color-text-muted)', padding: 'var(--space-md) 0' }}>No matching users.</p>
      )}

      {inventoryLoading ? (
        <div className="loading-state"><div className="spinner" />Loading inventory...</div>
      ) : inventory ? (
        <div style={{ marginTop: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingBottom: 'var(--space-sm)', borderBottom: '1px solid var(--color-border)' }}>
            <div>
              <strong>{inventory.name}</strong>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{inventory.email}</div>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              <Package size={16} /> {totalItems} item{totalItems !== 1 ? 's' : ''}
            </span>
          </div>

          {items.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', padding: 'var(--space-sm) 0' }}>This user has no artifacts.</p>
          ) : null}
          <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: 640, maxWidth: 'none', tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left' }}>
                <colgroup>
                  <col style={{ width: 220 }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 105 }} />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '8px 6px' }}>Set</th>
                    {['HEADGEAR', 'ARMOR', 'GLOVES', 'BOOTS'].map((slot) => (
                      <th key={slot} style={{ padding: '8px 4px', textAlign: 'center', fontSize: '0.78rem' }}>{slotTypeLabel(slot)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventorySets.map((set: any) => (
                    <tr key={set.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '9px 6px' }}>
                        <strong style={{ fontSize: '0.88rem', color: ARMORY_RARITY_COLORS[set.rarity] ?? 'var(--color-text-primary)' }}>{set.name}</strong>
                        <div style={{ color: ARMORY_RARITY_COLORS[set.rarity] ?? 'var(--color-text-muted)', fontSize: '0.72rem' }}>{set.rarity}</div>
                      </td>
                      {['HEADGEAR', 'ARMOR', 'GLOVES', 'BOOTS'].map((slot) => {
                        const quantity = quantityBySetAndSlot.get(`${set.name}:${slot}`) ?? 0;
                        return (
                          <td key={slot} style={{ padding: '9px 4px', textAlign: 'center', color: quantity ? ARMORY_RARITY_COLORS[set.rarity] ?? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontWeight: quantity ? 700 : 400 }}>
                            {quantity || '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        </div>
      ) : search.trim().length < 2 ? (
        <p style={{ color: 'var(--color-text-muted)', padding: 'var(--space-md) 0' }}>Enter at least 2 characters to search.</p>
      ) : null}
    </div>
  );
}
