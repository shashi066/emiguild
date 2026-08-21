'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Castle,
  CheckCircle2,
  Clock3,
  Coins,
  History,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  User,
} from 'lucide-react';
import type { TowerRewardConfig } from '@/lib/tower';

type AdminView = 'grant' | 'rewards' | 'history';
type UserResult = { id: string; name: string; email: string };
type HistoryItem = {
  id: string;
  source: string;
  effectiveStatus: string;
  earnedAt: string;
  expiresAt: string;
  user: UserResult;
  grantedBy?: { name: string } | null;
  attempt?: { status: string; securedLevel: number } | null;
};
type HistoryPage = { items: HistoryItem[]; nextCursor: string | null };

type Props = {
  initialConfig?: { enabled: boolean; rewards: TowerRewardConfig[] };
  initialHistory?: HistoryPage;
  manualGrantExpiresAt?: string;
  initialError?: string;
};

function validationError(rewards: TowerRewardConfig[]) {
  if (rewards.length !== 10) return 'The ladder needs exactly 10 rewards.';
  for (const [index, reward] of rewards.entries()) {
    if (reward.level !== index + 1 || !reward.name.trim()) return `Check floor ${index + 1}.`;
    if (!Number.isFinite(Number(reward.value)) || Number(reward.value) <= 0) return `Enter a value for floor ${reward.level}.`;
    if (reward.type === 'PASS' && !['BRONZE', 'SILVER', 'GOLD'].includes(reward.passType ?? '')) return `Choose a pass for floor ${reward.level}.`;
    if (reward.type === 'DISCOUNT' && Number(reward.value) > 100) return `Floor ${reward.level} discount cannot exceed 100%.`;
  }
  return '';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function newRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AdminTower({ initialConfig, initialHistory, manualGrantExpiresAt, initialError = '' }: Props) {
  const [view, setView] = useState<AdminView>('grant');
  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? true);
  const [rewards, setRewards] = useState<TowerRewardConfig[]>(initialConfig?.rewards ?? []);
  const [history, setHistory] = useState<HistoryPage>(initialHistory ?? { items: [], nextCursor: null });
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [granting, setGranting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStatus, setHistoryStatus] = useState('ALL');
  const [historyQuery, setHistoryQuery] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(
    initialError ? { type: 'error', text: initialError } : null,
  );
  const requestIdRef = useRef(newRequestId());
  const configError = validationError(rewards);

  useEffect(() => {
    if (selectedUser || query.trim().length < 2) {
      setUsers([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/admin/tower/users?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const data = await response.json();
        setUsers(response.ok ? data.users ?? [] : []);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setUsers([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, selectedUser]);

  const saveConfig = async () => {
    if (configError) return setNotice({ type: 'error', text: configError });
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/tower/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, rewards }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Tower settings could not be saved.');
      setEnabled(data.enabled !== false);
      setRewards(data.rewards ?? rewards);
      setNotice({ type: 'success', text: 'Tower settings saved.' });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Tower settings could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async (options: { append?: boolean; cursor?: string | null } = {}) => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ take: '25', status: historyStatus });
      if (historyQuery.trim()) params.set('q', historyQuery.trim());
      if (options.cursor) params.set('cursor', options.cursor);
      const response = await fetch(`/api/admin/tower/history?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'History could not load.');
      setHistory((current) => ({
        items: options.append ? [...current.items, ...(data.items ?? [])] : data.items ?? [],
        nextCursor: data.nextCursor ?? null,
      }));
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'History could not load.' });
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (view !== 'history') return;
    const timer = window.setTimeout(() => { loadHistory(); }, 250);
    return () => window.clearTimeout(timer);
    // Filters intentionally own history refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, historyStatus, historyQuery]);

  const grant = async () => {
    if (!selectedUser) return;
    setGranting(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/tower/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, requestId: requestIdRef.current }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Token could not be granted.');
      setNotice({
        type: 'success',
        text: data.created
          ? `Tower Token added for ${selectedUser.name}. Valid until ${formatDate(data.token.expiresAt)}.`
          : `Tower Token was already stored for ${selectedUser.name}. It expires ${formatDate(data.token.expiresAt)}.`,
      });
      requestIdRef.current = newRequestId();
      setSelectedUser(null);
      setQuery('');
      await loadHistory();
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Token could not be granted.' });
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="admin-tower-page">
      <header className="admin-tower-head">
        <div>
          <span>Tower Operations</span>
          <h1><Castle size={25} /> Tower of Rewards</h1>
          <p>Grant tokens, set floor rewards, and check recent attempts.</p>
        </div>
        <span className={enabled ? 'tower-mode enabled' : 'tower-mode'}>{enabled ? 'Enabled' : 'Disabled'}</span>
      </header>

      {notice && (
        <div className={notice.type === 'success' ? 'alert alert-success tower-notice' : 'alert alert-error tower-notice'} role="status">
          {notice.type === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="tower-admin-tabs" role="tablist" aria-label="Tower admin sections">
        <button type="button" role="tab" aria-selected={view === 'grant'} onClick={() => setView('grant')}><Coins size={16} /> Grant</button>
        <button type="button" role="tab" aria-selected={view === 'rewards'} onClick={() => setView('rewards')}><SlidersHorizontal size={16} /> Rewards</button>
        <button type="button" role="tab" aria-selected={view === 'history'} onClick={() => setView('history')}><History size={16} /> History</button>
      </div>

      {view === 'grant' && (
        <section className="tower-admin-panel" aria-labelledby="grant-title">
          <div className="panel-title"><Coins size={19} /><div><h2 id="grant-title">Grant Tower Token</h2><p>Each token is valid through the end of the next IST day.</p></div></div>
          <div className="tower-user-search">
            <label htmlFor="tower-user-search">Find user</label>
            <div className="search-input-wrap"><span className="search-leading-icon" aria-hidden="true"><Search size={17} /></span><input id="tower-user-search" className="form-input" value={selectedUser ? selectedUser.name : query} onChange={(event) => { setSelectedUser(null); setQuery(event.target.value); }} placeholder="Name or email" autoComplete="off" />{searching && <span className="search-loading-icon" aria-hidden="true"><LoaderCircle size={16} className="spin" /></span>}</div>
            {users.length > 0 && !selectedUser && <div className="tower-user-results">{users.map((user) => <button type="button" key={user.id} onClick={() => { setSelectedUser(user); setQuery(user.name); setUsers([]); }}><User size={16} /><span><strong>{user.name}</strong><small>{user.email}</small></span></button>)}</div>}
          </div>
          {selectedUser && <div className="selected-user"><User size={18} /><span><strong>{selectedUser.name}</strong><small>{selectedUser.email}</small>{manualGrantExpiresAt && <small>Expires {formatDate(manualGrantExpiresAt)}</small>}</span></div>}
          <button type="button" className="btn btn-primary tower-primary-action" onClick={grant} disabled={!selectedUser || granting}>{granting ? <LoaderCircle size={16} className="spin" /> : <Coins size={16} />}{granting ? 'Granting...' : 'Confirm Grant'}</button>
        </section>
      )}

      {view === 'rewards' && (
        <section className="tower-admin-panel" aria-labelledby="rewards-title">
          <div className="panel-title"><SlidersHorizontal size={19} /><div><h2 id="rewards-title">Tower Rewards</h2><p>One reward for each of the ten floors.</p></div></div>
          <label className="tower-enable-row"><span><strong>Tower availability</strong><small>Pause new starts and picks.</small></span><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /></label>
          <div className="reward-editor">{rewards.map((reward, index) => (
            <fieldset key={reward.level} className="reward-row">
              <legend>Floor {reward.level}</legend>
              <label className="reward-name-field">Reward<input className="form-input" value={reward.name} maxLength={80} onChange={(event) => setRewards((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} /></label>
              <label className="reward-type-field">Type<select className="form-input" value={reward.type} onChange={(event) => setRewards((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, type: event.target.value as TowerRewardConfig['type'], passType: event.target.value === 'PASS' ? row.passType ?? 'BRONZE' : undefined } : row))}><option value="GAMING_TIME">Gaming time</option><option value="RACING_TIME">Racing time</option><option value="DISCOUNT">Discount</option><option value="PASS">Pass</option></select></label>
              <label className="reward-value-field">{reward.type === 'DISCOUNT' ? 'Percent' : 'Value'}<input className="form-input" type="number" min={1} max={reward.type === 'DISCOUNT' ? 100 : 10000} value={reward.value ?? ''} onChange={(event) => setRewards((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value === '' ? undefined : Number(event.target.value) } : row))} /></label>
              {reward.type === 'PASS' && <label className="reward-pass-field">Pass<select className="form-input" value={reward.passType ?? 'BRONZE'} onChange={(event) => setRewards((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, passType: event.target.value } : row))}><option value="BRONZE">Bronze</option><option value="SILVER">Silver</option><option value="GOLD">Gold</option></select></label>}
            </fieldset>
          ))}</div>
          {configError && <div className="form-error"><AlertCircle size={15} />{configError}</div>}
          <button type="button" className="btn btn-primary tower-primary-action" onClick={saveConfig} disabled={saving || Boolean(configError)}>{saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{saving ? 'Saving...' : 'Save Rewards'}</button>
        </section>
      )}

      {view === 'history' && (
        <section className="tower-admin-panel" aria-labelledby="history-title">
          <div className="panel-title"><History size={19} /><div><h2 id="history-title">Recent Tower Activity</h2><p>Newest tokens and attempts first.</p></div></div>
          <div className="history-filters"><div className="search-input-wrap"><span className="search-leading-icon" aria-hidden="true"><Search size={16} /></span><input className="form-input" aria-label="Search Tower history" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="User name or email" /></div><select className="form-input" aria-label="Filter Tower history by status" value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}><option value="ALL">All statuses</option><option value="AVAILABLE">Available</option><option value="ACTIVE">Active</option><option value="LOST">Lost</option><option value="TIMED_OUT">Timed out</option><option value="COMPLETED">Completed</option><option value="CLAIMED">Claimed</option><option value="EXPIRED">Expired</option></select></div>
          <div className="history-list">{history.items.map((item) => (
            <article key={item.id} className="history-row"><div className="history-main"><strong>{item.user.name}</strong><small>{item.user.email}</small><span>{item.source === 'ADMIN' ? `Manual${item.grantedBy?.name ? ` by ${item.grantedBy.name}` : ''}` : 'Booking check-in'}</span><small>Earned {formatDate(item.earnedAt)}</small></div><div className="history-meta"><b data-status={item.effectiveStatus}>{item.effectiveStatus.replace('_', ' ')}</b><span>{item.attempt ? ['TIMED_OUT', 'EXPIRED', 'LOST'].includes(item.effectiveStatus) ? 'Zero reward' : `Secured floor ${item.attempt.securedLevel}` : 'Not started'}</span><small><Clock3 size={12} /> Expires {formatDate(item.expiresAt)}</small></div></article>
          ))}{!history.items.length && !historyLoading && <div className="history-empty">No Tower activity found.</div>}</div>
          {history.nextCursor && <button type="button" className="btn btn-ghost tower-load-more" disabled={historyLoading} onClick={() => loadHistory({ append: true, cursor: history.nextCursor })}>{historyLoading ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}Load More</button>}
        </section>
      )}

      <style jsx>{`
        .admin-tower-page { width: min(100%, 920px); display: grid; gap: 16px; }
        .admin-tower-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .admin-tower-head > div > span { color: #61e8ff; font-size: .72rem; font-weight: 800; text-transform: uppercase; }
        .admin-tower-head h1 { display: flex; align-items: center; gap: 9px; margin: 4px 0; font-size: 1.45rem; }
        .admin-tower-head p, .panel-title p { margin: 0; color: var(--color-text-muted); font-size: .82rem; }
        .tower-mode { flex: 0 0 auto; padding: 5px 8px; border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text-muted); font-size: .72rem; font-weight: 800; }
        .tower-mode.enabled { border-color: rgba(34,197,94,.35); color: #86efac; }
        .tower-notice { margin: 0; }
        .tower-notice span { min-width: 0; overflow-wrap: anywhere; }
        .tower-admin-tabs { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
        .tower-admin-tabs button { min-width: 0; min-height: 46px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-right: 1px solid var(--color-border); background: var(--color-bg-card); color: var(--color-text-secondary); font: inherit; font-size: .8rem; font-weight: 800; cursor: pointer; }
        .tower-admin-tabs button:last-child { border-right: 0; }
        .tower-admin-tabs button[aria-selected="true"] { background: rgba(97,232,255,.09); color: #8ee8ff; }
        .tower-admin-panel { min-width: 0; display: grid; gap: 16px; padding: 16px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-card); }
        .panel-title { display: flex; align-items: flex-start; gap: 10px; }
        .panel-title > svg { flex: 0 0 auto; color: #61e8ff; }
        .panel-title h2 { margin: 0 0 3px; font-size: 1rem; }
        .tower-user-search { position: relative; display: grid; gap: 6px; }
        .tower-user-search > label, .reward-row label { color: var(--color-text-muted); font-size: .72rem; font-weight: 700; }
        .search-input-wrap { position: relative; min-width: 0; display: block; }
        .search-input-wrap .form-input { width: 100%; min-height: 46px; padding-left: 36px; }
        .search-leading-icon, .search-loading-icon { position: absolute; z-index: 1; top: 0; bottom: 0; display: grid; place-items: center; color: var(--color-text-muted); pointer-events: none; }
        .search-leading-icon { left: 11px; }
        .search-loading-icon { right: 11px; }
        .tower-user-results { position: absolute; z-index: 3; top: calc(100% + 4px); left: 0; right: 0; display: grid; border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; background: #101827; box-shadow: 0 10px 24px rgba(0,0,0,.35); }
        .tower-user-results button { min-width: 0; min-height: 48px; display: flex; align-items: center; gap: 9px; padding: 11px; border: 0; border-bottom: 1px solid var(--color-border); background: transparent; color: var(--color-text-primary); text-align: left; cursor: pointer; }
        .tower-user-results button:last-child { border-bottom: 0; }
        .tower-user-results span, .selected-user span, .history-main, .history-meta { min-width: 0; display: grid; gap: 2px; }
        .tower-user-results small, .selected-user small, .history-row small { color: var(--color-text-muted); overflow-wrap: anywhere; }
        .selected-user { display: flex; align-items: center; gap: 10px; padding: 11px; border: 1px solid rgba(97,232,255,.28); border-radius: 8px; background: rgba(97,232,255,.05); }
        .tower-primary-action { width: 100%; min-height: 46px; justify-content: center; }
        .tower-enable-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px; border: 1px solid var(--color-border); border-radius: 8px; }
        .tower-enable-row span { display: grid; gap: 2px; }
        .tower-enable-row small { color: var(--color-text-muted); }
        .tower-enable-row input { flex: 0 0 auto; width: 22px; height: 22px; accent-color: var(--color-accent-primary); }
        .reward-editor { display: grid; gap: 8px; }
        .reward-row { min-width: 0; display: grid; grid-template-columns: minmax(0,1.35fr) minmax(76px,.65fr); gap: 8px; margin: 0; padding: 10px; border: 1px solid var(--color-border); border-radius: 8px; }
        .reward-row legend { padding: 0 5px; color: #8ee8ff; font-size: .75rem; font-weight: 900; }
        .reward-row label { min-width: 0; display: grid; gap: 4px; }
        .reward-row .form-input { width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; font-size: .88rem; }
        .reward-row select.form-input { padding-right: 32px; background-position: right 9px center; }
        .reward-name-field, .reward-pass-field { grid-column: 1 / -1; }
        .form-error { display: flex; align-items: center; gap: 7px; color: #fca5a5; font-size: .8rem; }
        .history-filters { display: grid; gap: 8px; }
        .history-filters .form-input { width: 100%; }
        .history-list { display: grid; }
        .history-row { min-width: 0; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--color-border); }
        .history-main > span { color: var(--color-text-secondary); font-size: .75rem; }
        .history-meta { justify-items: end; text-align: right; }
        .history-meta b { color: #8ee8ff; font-size: .7rem; }
        .history-meta b[data-status="LOST"], .history-meta b[data-status="TIMED_OUT"], .history-meta b[data-status="EXPIRED"] { color: #fca5a5; }
        .history-meta b[data-status="CLAIMED"], .history-meta b[data-status="COMPLETED"] { color: #86efac; }
        .history-meta > span { color: var(--color-text-secondary); font-size: .75rem; }
        .history-meta small { display: inline-flex; align-items: center; gap: 4px; font-size: .68rem; }
        .history-empty { padding: 30px 12px; color: var(--color-text-muted); text-align: center; }
        .tower-load-more { justify-self: center; }
        .spin { animation: spin 900ms linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 680px) {
          .tower-admin-panel { padding: 20px; }
          .reward-row { grid-template-columns: minmax(180px,1fr) minmax(130px,.7fr) minmax(100px,.45fr) minmax(100px,.5fr); align-items: end; }
          .reward-name-field, .reward-pass-field { grid-column: auto; }
          .history-filters { grid-template-columns: minmax(0,1fr) 180px; }
          .tower-primary-action { width: auto; min-width: 180px; justify-self: end; }
        }
        @media (max-width: 520px) {
          .admin-tower-page { gap: 14px; }
          .admin-tower-head h1 { font-size: 1.32rem; line-height: 1.18; }
          .tower-admin-panel { gap: 14px; padding: 12px; }
          .history-row { grid-template-columns: minmax(0,1fr); gap: 8px; padding: 14px 0; }
          .history-main { gap: 3px; }
          .history-main strong { overflow-wrap: anywhere; }
          .history-meta { grid-template-columns: auto minmax(0,1fr); align-items: center; gap: 4px 10px; justify-items: start; text-align: left; }
          .history-meta > span { justify-self: end; text-align: right; }
          .history-meta small { grid-column: 1 / -1; }
        }
        @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
      `}</style>
    </div>
  );
}
