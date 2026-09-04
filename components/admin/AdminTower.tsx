'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Castle,
  CheckCircle2,
  Clock3,
  Coins,
  History,
  LoaderCircle,
  Megaphone,
  Pencil,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  User,
  Users,
  X,
} from 'lucide-react';
import { AdminModalShell } from '@/components/admin/AdminModalShell';
import type { TowerRewardConfig } from '@/lib/tower';
import {
  DEFAULT_TOWER_RUN_DURATION_SECONDS,
  TOWER_RUN_DURATION_OPTIONS_SECONDS,
} from '@/lib/tower-clock';

type AdminView = 'grant' | 'rewards' | 'history';
type ConfigEditor = 'availability' | 'timer' | 'rewards' | null;
type UserResult = { id: string; name: string; email: string };
type HistoryItem = {
  id: string;
  source: string;
  effectiveStatus: string;
  adminStatus?: string;
  earnedAt: string;
  expiresAt: string;
  user: UserResult;
  grantedBy?: { name: string } | null;
  attempt?: { status: string; securedLevel: number } | null;
};
type HistoryPage = { items: HistoryItem[]; nextCursor: string | null };
type PromotionPreview = { enabled: boolean; recipientCount: number; expiresAt: string };

type Props = {
  initialConfig?: { enabled: boolean; rewards: TowerRewardConfig[]; runDurationSeconds: number };
  initialHistory?: HistoryPage;
  manualGrantExpiresAt?: string;
  initialError?: string;
};

function validationError(rewards: TowerRewardConfig[]) {
  if (rewards.length !== 10) return 'The ladder needs exactly 10 rewards.';
  for (const [index, reward] of rewards.entries()) {
    if (reward.level !== index + 1) return `Check floor ${index + 1}.`;
    if (!['GAMING_TIME', 'RACING_TIME', 'DISCOUNT', 'PASS'].includes(reward.type)) return `Choose a type for floor ${reward.level}.`;
    if (reward.type === 'PASS') {
      if (!reward.name.trim() || reward.name.trim().length > 80) return `Enter a pass name for floor ${reward.level}.`;
      continue;
    }
    if (!Number.isInteger(Number(reward.value)) || Number(reward.value) <= 0 || Number(reward.value) > 10000) return `Enter a whole-number value for floor ${reward.level}.`;
    if (reward.type === 'DISCOUNT' && Number(reward.value) > 100) return `Floor ${reward.level} discount cannot exceed 100%.`;
  }
  return '';
}

function rewardTypeLabel(type: TowerRewardConfig['type']) {
  const labels: Record<TowerRewardConfig['type'], string> = {
    GAMING_TIME: 'Gaming time',
    RACING_TIME: 'Racing time',
    DISCOUNT: 'Discount',
    PASS: 'Pass',
  };
  return labels[type];
}

function rewardValueLabel(reward: TowerRewardConfig) {
  if (reward.type === 'PASS') return reward.name;
  return `${reward.value} ${reward.type === 'DISCOUNT' ? '%' : 'min'}`;
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

function formatClimbDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes} min ${seconds} sec` : `${minutes} min`;
}

function historyStatusLabel(status: string) {
  const labels: Record<string, string> = {
    TOKEN_READY: 'Token ready',
    IN_CLIMB: 'In climb',
    REWARD_CLAIMED: 'Reward claimed',
    NO_REWARD: 'No reward',
    EXPIRED: 'Expired',
  };
  return labels[status] ?? status.replace('_', ' ');
}

function historyStatusForItem(item: HistoryItem) {
  if (item.adminStatus) return item.adminStatus;
  if (item.effectiveStatus === 'AVAILABLE') return 'TOKEN_READY';
  if (item.effectiveStatus === 'CLAIMED') return 'REWARD_CLAIMED';
  if (['LOST', 'TIMED_OUT'].includes(item.effectiveStatus)) return 'NO_REWARD';
  if (item.effectiveStatus === 'EXPIRED') return 'EXPIRED';
  if (['IN_PROGRESS', 'COMPLETED'].includes(item.effectiveStatus)) return 'IN_CLIMB';
  return item.effectiveStatus;
}

function historyDetailForItem(item: HistoryItem) {
  const status = historyStatusForItem(item);
  if (status === 'TOKEN_READY') return 'Not started';
  if (status === 'NO_REWARD' || status === 'EXPIRED') return 'Zero reward';
  if (status === 'REWARD_CLAIMED') return `Claimed floor ${item.attempt?.securedLevel ?? 0}`;
  if (item.attempt) return `Secured floor ${item.attempt.securedLevel}`;
  return 'Not started';
}

function historySourceLabel(item: HistoryItem) {
  const grantor = item.grantedBy?.name ? ` by ${item.grantedBy.name}` : '';
  if (item.source === 'PROMOTION') return `Promotion${grantor}`;
  if (item.source === 'ADMIN') return `Manual${grantor}`;
  return 'Booking check-in';
}

function TowerConfigModal({
  title,
  titleId,
  saving,
  error,
  saveDisabled = false,
  onClose,
  onSave,
  children,
}: {
  title: string;
  titleId: string;
  saving: boolean;
  error: string;
  saveDisabled?: boolean;
  onClose: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <AdminModalShell onClose={onClose} labelledBy={titleId} size="wide">
      <form
        noValidate
        className="tower-config-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving && !saveDisabled) onSave();
        }}
      >
        <div className="tower-config-modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="btn btn-ghost btn-sm" type="button" aria-label={`Close ${title}`} disabled={saving} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
        {error && <div className="form-error" role="alert"><AlertCircle size={15} />{error}</div>}
        <div className="tower-config-actions">
          <button className="btn btn-ghost btn-sm" type="button" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" type="submit" disabled={saving || saveDisabled}>
            {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
      <style jsx global>{`
        .tower-config-modal { display: grid; gap: var(--space-lg); }
        .tower-config-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .tower-config-modal-head h2 { margin: 0; font-size: 1.25rem; }
        .tower-config-modal-head button { flex-shrink: 0; padding: 8px; }
        .tower-config-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
      `}</style>
    </AdminModalShell>
  );
}

function TowerSummaryCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="tower-summary-card">
      <div className="tower-summary-head">
        <h3>{title}</h3>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onEdit}>
          <Pencil size={14} /> Edit
        </button>
      </div>
      <div className="tower-summary-content">{children}</div>
      <style jsx>{`
        .tower-summary-card { min-width: 0; display: grid; align-content: start; gap: 14px; padding: 16px; border: 1px solid rgba(199,183,255,.28); border-radius: 8px; background: var(--color-bg-card); box-shadow: inset 3px 0 0 rgba(139,131,255,.72); }
        .tower-summary-head { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .tower-summary-head h3 { margin: 0; font-size: 1.05rem; }
        .tower-summary-head button { flex: 0 0 auto; color: #c7b7ff; background: rgba(139,131,255,.12); border: 1px solid rgba(199,183,255,.34); }
        .tower-summary-content { min-width: 0; display: grid; gap: 8px; color: var(--color-text-secondary); font-size: .88rem; }
      `}</style>
    </section>
  );
}

export function AdminTower({ initialConfig, initialHistory, manualGrantExpiresAt, initialError = '' }: Props) {
  const [view, setView] = useState<AdminView>('grant');
  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? true);
  const [rewards, setRewards] = useState<TowerRewardConfig[]>(initialConfig?.rewards ?? []);
  const [runDurationSeconds, setRunDurationSeconds] = useState(
    initialConfig?.runDurationSeconds ?? DEFAULT_TOWER_RUN_DURATION_SECONDS,
  );
  const [history, setHistory] = useState<HistoryPage>(initialHistory ?? { items: [], nextCursor: null });
  const [query, setQuery] = useState('');
  const [activeEditor, setActiveEditor] = useState<ConfigEditor>(null);
  const [enabledDraft, setEnabledDraft] = useState(enabled);
  const [timerDraft, setTimerDraft] = useState(runDurationSeconds);
  const [rewardDraft, setRewardDraft] = useState<TowerRewardConfig[]>([]);
  const [editorError, setEditorError] = useState('');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [granting, setGranting] = useState(false);
  const [grantQuantity, setGrantQuantity] = useState('1');
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [promotionPreview, setPromotionPreview] = useState<PromotionPreview | null>(null);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [promotionGranting, setPromotionGranting] = useState(false);
  const [promotionError, setPromotionError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStatus, setHistoryStatus] = useState('ALL');
  const [historyQuery, setHistoryQuery] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(
    initialError ? { type: 'error', text: initialError } : null,
  );
  const requestIdRef = useRef(newRequestId());
  const promotionRequestIdRef = useRef(newRequestId());
  const configError = validationError(rewards);
  const draftConfigError = activeEditor === 'rewards' ? validationError(rewardDraft) : '';
  const requestedGrantQuantity = Number(grantQuantity);
  const grantQuantityValid = Number.isInteger(requestedGrantQuantity)
    && requestedGrantQuantity >= 1
    && requestedGrantQuantity <= 10;
  const grantBusy = granting || promotionLoading || promotionGranting;

  const openAvailabilityModal = () => {
    setEnabledDraft(enabled);
    setEditorError('');
    setActiveEditor('availability');
  };

  const openRewardsModal = () => {
    setRewardDraft(rewards.map((reward) => ({ ...reward })));
    setEditorError('');
    setActiveEditor('rewards');
  };

  const openTimerModal = () => {
    setTimerDraft(runDurationSeconds);
    setEditorError('');
    setActiveEditor('timer');
  };

  const closeConfigModal = () => {
    if (saving) return;
    setActiveEditor(null);
    setEnabledDraft(enabled);
    setTimerDraft(runDurationSeconds);
    setRewardDraft([]);
    setEditorError('');
  };

  const updateRewardType = (index: number, type: TowerRewardConfig['type']) => {
    setRewardDraft((rows) => rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      if (type === 'PASS') return { ...row, type, name: row.type === 'PASS' ? row.name : 'Pass', value: undefined };
      return { ...row, type, value: row.value ?? 1 };
    }));
  };

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

  const saveConfig = async (
    nextEnabled: boolean,
    nextRewards: TowerRewardConfig[],
    nextRunDurationSeconds: number,
  ) => {
    const error = validationError(nextRewards);
    if (error) return setEditorError(error);
    setSaving(true);
    setNotice(null);
    setEditorError('');
    try {
      const response = await fetch('/api/admin/tower/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: nextEnabled,
          rewards: nextRewards,
          runDurationSeconds: nextRunDurationSeconds,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Tower settings could not be saved.');
      setEnabled(data.enabled !== false);
      setEnabledDraft(data.enabled !== false);
      setRewards(data.rewards ?? nextRewards);
      setRunDurationSeconds(data.runDurationSeconds ?? nextRunDurationSeconds);
      setTimerDraft(data.runDurationSeconds ?? nextRunDurationSeconds);
      setRewardDraft([]);
      setActiveEditor(null);
      setNotice({ type: 'success', text: 'Tower settings saved.' });
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Tower settings could not be saved.');
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
    if (!selectedUser || promotionLoading || promotionGranting) return;
    setGranting(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/tower/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, requestId: requestIdRef.current, quantity: requestedGrantQuantity }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Token could not be granted.');
      const grantedQuantity = Number(data.quantity ?? requestedGrantQuantity);
      const tokenLabel = `${grantedQuantity} Tower Token${grantedQuantity === 1 ? '' : 's'}`;
      setNotice({
        type: 'success',
        text: data.created
          ? `${tokenLabel} added for ${selectedUser.name}. Valid until ${formatDate(data.expiresAt)}.`
          : `This ${grantedQuantity}-token grant was already stored for ${selectedUser.name}. It expires ${formatDate(data.expiresAt)}.`,
      });
      requestIdRef.current = newRequestId();
      await loadHistory();
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Token could not be granted.' });
    } finally {
      setGranting(false);
    }
  };

  const closePromotionDialog = () => {
    if (promotionGranting) return;
    setPromotionOpen(false);
    setPromotionPreview(null);
    setPromotionError('');
  };

  const openPromotionDialog = async () => {
    if (!enabled || grantBusy) return;
    setPromotionLoading(true);
    setPromotionError('');
    setNotice(null);
    try {
      const response = await fetch('/api/admin/tower/tokens/promotion', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Promotion details could not be loaded.');
      if (data.enabled === false) throw new Error('Enable Tower before granting promotional tokens.');
      const recipientCount = Number(data.recipientCount);
      if (!Number.isInteger(recipientCount) || recipientCount < 1) {
        throw new Error('No user accounts are available for this promotion.');
      }
      setPromotionPreview({ enabled: true, recipientCount, expiresAt: data.expiresAt });
      setPromotionOpen(true);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Promotion details could not be loaded.' });
    } finally {
      setPromotionLoading(false);
    }
  };

  const grantPromotion = async () => {
    if (!promotionPreview || promotionGranting) return;
    setPromotionGranting(true);
    setPromotionError('');
    try {
      const response = await fetch('/api/admin/tower/tokens/promotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: promotionRequestIdRef.current }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Promotional tokens could not be granted.');

      const recipientCount = Number(data.recipientCount);
      setNotice({
        type: 'success',
        text: data.created
          ? `${recipientCount} promotional Tower Token${recipientCount === 1 ? '' : 's'} added. Valid until ${formatDate(data.expiresAt)}.`
          : `This promotion was already completed for ${recipientCount} user${recipientCount === 1 ? '' : 's'}. It expires ${formatDate(data.expiresAt)}.`,
      });
      promotionRequestIdRef.current = newRequestId();
      setPromotionOpen(false);
      setPromotionPreview(null);
      await loadHistory();
    } catch (error) {
      setPromotionError(error instanceof Error ? error.message : 'Promotional tokens could not be granted.');
    } finally {
      setPromotionGranting(false);
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
          <div className="tower-grant-controls">
            <label className="tower-token-quantity" htmlFor="tower-token-quantity">Number of Tokens<input id="tower-token-quantity" className="form-input" type="number" inputMode="numeric" min={1} max={10} step={1} value={grantQuantity} disabled={grantBusy} onChange={(event) => setGrantQuantity(event.target.value)} /></label>
            <button type="button" className="btn btn-primary tower-primary-action" onClick={grant} disabled={!selectedUser || !grantQuantityValid || grantBusy}>{granting ? <LoaderCircle size={16} className="spin" /> : <Coins size={16} />}{granting ? 'Granting...' : grantQuantityValid ? `Grant ${requestedGrantQuantity} Token${requestedGrantQuantity === 1 ? '' : 's'}` : 'Grant Tokens'}</button>
          </div>
          <div className="tower-promotion-row">
            <span className="tower-promotion-icon" aria-hidden="true"><Megaphone size={20} /></span>
            <div><strong>Promotional Grant</strong><small>Add one Tower Token to every user account.</small></div>
            <button type="button" className="btn btn-ghost tower-promotion-action" onClick={openPromotionDialog} disabled={!enabled || grantBusy}>{promotionLoading ? <LoaderCircle size={16} className="spin" /> : <Users size={16} />}{!enabled ? 'Enable Tower First' : promotionLoading ? 'Checking...' : 'Grant to All Users'}</button>
          </div>
        </section>
      )}

      {view === 'rewards' && (
        <section className="tower-admin-panel tower-rewards-panel" aria-labelledby="rewards-title">
          <div className="panel-title"><SlidersHorizontal size={19} /><div><h2 id="rewards-title">Tower Rewards</h2><p>One reward for each of the ten floors.</p></div></div>
          <div className="tower-settings-grid">
            <TowerSummaryCard title="Tower Availability" onEdit={openAvailabilityModal}>
              <strong className={enabled ? 'tower-setting-enabled' : 'tower-setting-disabled'}>{enabled ? 'Enabled' : 'Disabled'}</strong>
              <span>{enabled ? 'Players can start and continue climbs.' : 'New starts and picks are paused.'}</span>
            </TowerSummaryCard>
            <TowerSummaryCard title="Climb Timer" onEdit={openTimerModal}>
              <strong className="tower-timer-summary"><Clock3 size={17} /> {formatClimbDuration(runDurationSeconds)}</strong>
              <span>New climbs use this limit. The warning starts with one minute left.</span>
            </TowerSummaryCard>
            <TowerSummaryCard title="Floor Rewards" onEdit={openRewardsModal}>
              <div className="reward-summary-list">{rewards.map((reward) => (
                <div key={reward.level} className="reward-summary-row">
                  <span>{reward.level}</span>
                  <strong>{reward.name}</strong>
                  <small>{rewardTypeLabel(reward.type)} - {rewardValueLabel(reward)}</small>
                </div>
              ))}</div>
              {configError && <div className="form-error"><AlertCircle size={15} />{configError}</div>}
            </TowerSummaryCard>
          </div>
        </section>
      )}

      {activeEditor === 'availability' && (
        <TowerConfigModal
          title="Tower Availability"
          titleId="tower-availability-editor-title"
          saving={saving}
          error={editorError}
          onClose={closeConfigModal}
          onSave={() => saveConfig(enabledDraft, rewards, runDurationSeconds)}
        >
          <label className="tower-enable-row">
            <span><strong>Allow Tower climbs</strong><small>Pause new starts and picks when disabled.</small></span>
            <input type="checkbox" checked={enabledDraft} onChange={(event) => setEnabledDraft(event.target.checked)} />
          </label>
        </TowerConfigModal>
      )}

      {activeEditor === 'timer' && (
        <TowerConfigModal
          title="Climb Timer"
          titleId="tower-timer-editor-title"
          saving={saving}
          error={editorError}
          onClose={closeConfigModal}
          onSave={() => saveConfig(enabled, rewards, timerDraft)}
        >
          <div className="tower-timer-options" role="group" aria-label="Tower climb duration">
            {TOWER_RUN_DURATION_OPTIONS_SECONDS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                aria-pressed={timerDraft === seconds}
                onClick={() => setTimerDraft(seconds)}
              >
                <Clock3 size={16} />
                {formatClimbDuration(seconds)}
              </button>
            ))}
          </div>
        </TowerConfigModal>
      )}

      {activeEditor === 'rewards' && (
        <TowerConfigModal
          title="Tower Rewards"
          titleId="tower-rewards-editor-title"
          saving={saving}
          error={editorError || draftConfigError}
          saveDisabled={Boolean(draftConfigError)}
          onClose={closeConfigModal}
          onSave={() => saveConfig(enabled, rewardDraft, runDurationSeconds)}
        >
          <div className="reward-editor">{rewardDraft.map((reward, index) => (
            <div key={reward.level} className="reward-row" role="group" aria-labelledby={`tower-floor-${reward.level}-label`}>
              <strong id={`tower-floor-${reward.level}-label`} className="reward-floor">Floor <span>{reward.level}</span></strong>
              <label className="reward-type-field">Reward Type<select className="form-input" value={reward.type} onChange={(event) => updateRewardType(index, event.target.value as TowerRewardConfig['type'])}><option value="GAMING_TIME">Gaming time</option><option value="RACING_TIME">Racing time</option><option value="DISCOUNT">Discount</option><option value="PASS">Pass</option></select></label>
              {reward.type === 'PASS' ? (
                <label className="reward-value-field">Pass Name<input className="form-input" type="text" maxLength={80} value={reward.name} onChange={(event) => setRewardDraft((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} /></label>
              ) : (
                <label className="reward-value-field">{reward.type === 'DISCOUNT' ? 'Percent' : 'Minutes'}<input className="form-input" type="number" min={1} max={reward.type === 'DISCOUNT' ? 100 : 10000} step={1} value={reward.value || ''} onChange={(event) => setRewardDraft((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, value: Number(event.target.value) } : row))} /></label>
              )}
            </div>
          ))}</div>
        </TowerConfigModal>
      )}

      {promotionOpen && promotionPreview && (
        <AdminModalShell onClose={closePromotionDialog} labelledBy="tower-promotion-title" describedBy="tower-promotion-description">
          <div className="tower-promotion-modal">
            <div className="tower-promotion-modal-head">
              <span aria-hidden="true"><Megaphone size={22} /></span>
              <div><small>Promotional Grant</small><h2 id="tower-promotion-title">Grant one token to every user?</h2></div>
              <button type="button" aria-label="Close promotional grant" onClick={closePromotionDialog} disabled={promotionGranting}><X size={18} /></button>
            </div>
            <p id="tower-promotion-description">Each existing user account will receive one additional Tower Token. Tokens they already have will remain available.</p>
            <div className="tower-promotion-facts">
              <span><Users size={17} /><small>Recipients</small><strong>{promotionPreview.recipientCount.toLocaleString('en-IN')}</strong></span>
              <span><Clock3 size={17} /><small>Valid until</small><strong>{formatDate(promotionPreview.expiresAt)}</strong></span>
            </div>
            {promotionError && <div className="form-error" role="alert"><AlertCircle size={15} />{promotionError}</div>}
            <div className="tower-promotion-actions">
              <button type="button" className="btn btn-ghost" onClick={closePromotionDialog} disabled={promotionGranting}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={grantPromotion} disabled={promotionGranting} autoFocus>{promotionGranting ? <LoaderCircle size={16} className="spin" /> : <Megaphone size={16} />}{promotionGranting ? 'Granting...' : `Grant to ${promotionPreview.recipientCount.toLocaleString('en-IN')} Users`}</button>
            </div>
          </div>
        </AdminModalShell>
      )}

      {view === 'history' && (
        <section className="tower-admin-panel" aria-labelledby="history-title">
          <div className="panel-title"><History size={19} /><div><h2 id="history-title">Recent Tower Activity</h2><p>Newest tokens and attempts first.</p></div></div>
          <div className="history-filters"><div className="search-input-wrap"><span className="search-leading-icon" aria-hidden="true"><Search size={16} /></span><input className="form-input" aria-label="Search Tower history" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="User name or email" /></div><select className="form-input" aria-label="Filter Tower history by status" value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}><option value="ALL">All statuses</option><option value="AVAILABLE">Token ready</option><option value="IN_CLIMB">In climb</option><option value="REWARD_CLAIMED">Reward claimed</option><option value="NO_REWARD">No reward</option><option value="EXPIRED">Expired</option></select></div>
          <div className="history-list">{history.items.map((item) => (
            <article key={item.id} className="history-row"><div className="history-main"><strong>{item.user.name}</strong><small>{item.user.email}</small><span>{historySourceLabel(item)}</span><small>Earned {formatDate(item.earnedAt)}</small></div><div className="history-meta"><b data-status={historyStatusForItem(item)}>{historyStatusLabel(historyStatusForItem(item))}</b><span>{historyDetailForItem(item)}</span><small><Clock3 size={12} /> Expires {formatDate(item.expiresAt)}</small></div></article>
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
        .tower-rewards-panel { padding: 0; border: 0; background: transparent; }
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
        .tower-grant-controls { min-width: 0; display: grid; gap: 8px; }
        .tower-token-quantity { min-width: 0; display: grid; gap: 6px; color: var(--color-text-muted); font-size: .72rem; font-weight: 700; }
        .tower-token-quantity .form-input { width: 100%; min-height: 46px; }
        .tower-primary-action { width: 100%; min-height: 46px; justify-content: center; }
        .tower-promotion-row { min-width: 0; display: grid; grid-template-columns: auto minmax(0,1fr); gap: 10px; align-items: center; padding-top: 16px; border-top: 1px solid var(--color-border); }
        .tower-promotion-icon { width: 40px; height: 40px; display: grid; place-items: center; border: 1px solid rgba(250,204,21,.38); border-radius: 7px; background: rgba(250,204,21,.08); color: #fde68a; }
        .tower-promotion-row > div { min-width: 0; display: grid; gap: 2px; }
        .tower-promotion-row strong { font-size: .88rem; }
        .tower-promotion-row small { color: var(--color-text-muted); font-size: .74rem; }
        .tower-promotion-action { grid-column: 1 / -1; width: 100%; min-height: 46px; justify-content: center; border-color: rgba(250,204,21,.28); color: #fde68a; }
        .tower-promotion-modal { min-width: 0; display: grid; gap: 16px; padding: 20px; }
        .tower-promotion-modal-head { min-width: 0; display: grid; grid-template-columns: auto minmax(0,1fr) auto; gap: 10px; align-items: start; }
        .tower-promotion-modal-head > span { width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid rgba(250,204,21,.4); border-radius: 7px; background: rgba(250,204,21,.08); color: #fde68a; }
        .tower-promotion-modal-head > div { min-width: 0; }
        .tower-promotion-modal-head small { color: #fde68a; font-size: .68rem; font-weight: 800; text-transform: uppercase; }
        .tower-promotion-modal-head h2 { margin: 3px 0 0; font-size: 1.1rem; line-height: 1.25; }
        .tower-promotion-modal-head button { width: 40px; height: 40px; display: grid; place-items: center; border: 1px solid var(--color-border); border-radius: 7px; background: transparent; color: var(--color-text-secondary); cursor: pointer; }
        .tower-promotion-modal > p { margin: 0; color: var(--color-text-secondary); font-size: .84rem; line-height: 1.5; }
        .tower-promotion-facts { min-width: 0; display: grid; gap: 8px; }
        .tower-promotion-facts > span { min-width: 0; display: grid; grid-template-columns: auto minmax(0,1fr); gap: 2px 8px; align-items: center; padding: 10px; border: 1px solid var(--color-border); border-radius: 7px; }
        .tower-promotion-facts svg { grid-row: span 2; color: #8ee8ff; }
        .tower-promotion-facts small { color: var(--color-text-muted); font-size: .68rem; }
        .tower-promotion-facts strong { min-width: 0; overflow-wrap: anywhere; font-size: .82rem; }
        .tower-promotion-actions { display: grid; grid-template-columns: minmax(0,.7fr) minmax(0,1.3fr); gap: 8px; }
        .tower-promotion-actions .btn { min-width: 0; min-height: 46px; justify-content: center; }
        .tower-enable-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px; border: 1px solid var(--color-border); border-radius: 8px; }
        .tower-enable-row span { display: grid; gap: 2px; }
        .tower-enable-row small { color: var(--color-text-muted); }
        .tower-enable-row input { flex: 0 0 auto; width: 22px; height: 22px; accent-color: var(--color-accent-primary); }
        .tower-settings-grid { min-width: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 12px; align-items: start; }
        .tower-setting-enabled { color: #86efac; }
        .tower-setting-disabled { color: var(--color-text-muted); }
        .tower-timer-summary { display: inline-flex; align-items: center; gap: 7px; color: #8ee8ff; }
        .tower-timer-options { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
        .tower-timer-options button { min-width: 0; min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 10px; border: 1px solid var(--color-border); border-radius: 7px; background: rgba(255,255,255,.025); color: var(--color-text-secondary); font: inherit; font-size: .82rem; font-weight: 800; cursor: pointer; }
        .tower-timer-options button[aria-pressed="true"] { border-color: rgba(97,232,255,.7); background: rgba(97,232,255,.1); color: #8ee8ff; }
        .tower-timer-options button:focus-visible { outline: 2px solid #8ee8ff; outline-offset: 2px; }
        .reward-summary-list { display: grid; gap: 8px; }
        .reward-summary-row { min-width: 0; display: grid; grid-template-columns: 36px minmax(0,1fr); gap: 4px 10px; align-items: center; padding: 10px; border: 1px solid var(--color-border); border-radius: 8px; background: rgba(255,255,255,.025); }
        .reward-summary-row > span { grid-row: span 2; width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid rgba(97,232,255,.4); border-radius: 6px; color: #8ee8ff; font-weight: 900; }
        .reward-summary-row strong { min-width: 0; overflow-wrap: anywhere; font-size: .84rem; }
        .reward-summary-row small { color: var(--color-text-muted); font-size: .7rem; }
        .reward-editor { display: grid; gap: 8px; }
        .reward-row { min-width: 0; display: grid; gap: 8px; padding: 10px; border: 1px solid var(--color-border); border-radius: 8px; }
        .reward-floor { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-secondary); font-size: .78rem; }
        .reward-floor span { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid rgba(97,232,255,.4); border-radius: 6px; color: #8ee8ff; }
        .reward-row label { min-width: 0; display: grid; gap: 4px; }
        .reward-row .form-input { width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; font-size: .88rem; }
        .reward-row select.form-input { padding-right: 32px; background-position: right 9px center; }
        .form-error { display: flex; align-items: center; gap: 7px; color: #fca5a5; font-size: .8rem; }
        .history-filters { display: grid; gap: 8px; }
        .history-filters .form-input { width: 100%; }
        .history-list { display: grid; }
        .history-row { min-width: 0; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--color-border); }
        .history-main > span { color: var(--color-text-secondary); font-size: .75rem; }
        .history-meta { justify-items: end; text-align: right; }
        .history-meta b { color: #8ee8ff; font-size: .7rem; }
        .history-meta b[data-status="NO_REWARD"], .history-meta b[data-status="EXPIRED"] { color: #fca5a5; }
        .history-meta b[data-status="REWARD_CLAIMED"] { color: #86efac; }
        .history-meta > span { color: var(--color-text-secondary); font-size: .75rem; }
        .history-meta small { display: inline-flex; align-items: center; gap: 4px; font-size: .68rem; }
        .history-empty { padding: 30px 12px; color: var(--color-text-muted); text-align: center; }
        .tower-load-more { justify-self: center; }
        .spin { animation: spin 900ms linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 680px) {
          .tower-admin-panel { padding: 20px; }
          .tower-rewards-panel { padding: 0; }
          .reward-row { grid-template-columns: 82px minmax(180px,1fr) minmax(120px,.6fr); align-items: end; }
          .reward-floor { min-height: 44px; }
          .history-filters { grid-template-columns: minmax(0,1fr) 180px; }
          .tower-grant-controls { grid-template-columns: 150px auto; align-items: end; }
          .tower-primary-action { width: auto; min-width: 180px; justify-self: end; }
          .tower-promotion-row { grid-template-columns: auto minmax(0,1fr) auto; }
          .tower-promotion-action { grid-column: auto; width: auto; min-width: 190px; }
          .tower-promotion-facts { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .tower-timer-options { grid-template-columns: repeat(3, minmax(0,1fr)); }
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
