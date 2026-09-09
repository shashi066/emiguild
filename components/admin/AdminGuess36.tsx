'use client';

import { FormEvent, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coins,
  Edit3,
  Grid3X3,
  RefreshCw,
  Save,
  Target,
  TicketCheck,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { AdminModalShell } from '@/components/admin/AdminModalShell';
import { DEFAULT_GUESS_36_MODES, DEFAULT_GUESS_36_REWARDS, GUESS_36_TIERS, guess36SelectionLabel, normalizeGuess36Rewards } from '@/lib/guess-36-rules';
import type { Guess36AdminData, Guess36AdminItem, Guess36Config, Guess36Mode, Guess36Reward, Guess36Rewards, Guess36Tier } from '@/lib/guess-36-types';

type Props = {
  initialConfig?: Guess36Config;
  initialData?: Guess36AdminData;
  initialError?: string;
};

type RewardDraft = Record<Guess36Tier, { type: Guess36Reward['type']; value: string }>;
const PICK_TYPES: { id: Guess36Mode; label: string; description: string }[] = [
  { id: 'NUMBER', label: 'Number', description: 'Pick 1 from 36' },
  { id: 'PARITY', label: 'Even / Odd', description: 'Two 50/50 choices' },
  { id: 'RANGE', label: 'Range', description: 'Three 12-number zones' },
];
function rewardDrafts(rewards: Guess36Rewards): RewardDraft {
  const draft = (reward: Guess36Reward) => ({ type: reward.type, value: reward.type === 'PASS' ? reward.name : String(reward.value ?? '') });
  return { EXACT: draft(rewards.EXACT), GROUP: draft(rewards.GROUP), PARITY: draft(rewards.PARITY) };
}
function rewardsFromDraft(draft: RewardDraft): Guess36Rewards {
  return normalizeGuess36Rewards(Object.fromEntries(GUESS_36_TIERS.map(({ id }) => [id, draft[id].type === 'PASS'
    ? { type: 'PASS', name: draft[id].value }
    : { type: draft[id].type, value: draft[id].value.trim() ? Number(draft[id].value) : NaN }])));
}

function formatRoundDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusClass(status: string) {
  return status.toLowerCase().replace('_', '-');
}

async function responseJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export function AdminGuess36({ initialConfig, initialData, initialError }: Props) {
  const [config, setConfig] = useState<Guess36Config>(initialConfig ?? {
    enabled: false, enabledModes: DEFAULT_GUESS_36_MODES, rewards: DEFAULT_GUESS_36_REWARDS, todayRewards: DEFAULT_GUESS_36_REWARDS, effectiveFrom: '',
  });
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<'entries' | 'winners'>(initialData?.view ?? 'entries');
  const [dateDraft, setDateDraft] = useState(initialData?.round.date ?? initialData?.summary.today.date ?? '');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [success, setSuccess] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState(initialConfig?.enabled ?? false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);
  const [modesDraft, setModesDraft] = useState<Guess36Mode[]>(initialConfig?.enabledModes ?? DEFAULT_GUESS_36_MODES);
  const [rewardsDraft, setRewardsDraft] = useState(() => rewardDrafts(initialConfig?.rewards ?? DEFAULT_GUESS_36_REWARDS));
  const [modalError, setModalError] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [drawDate, setDrawDate] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  const loadData = async (nextView = view, roundDate = dateDraft, cursor?: string) => {
    cursor ? setLoadingMore(true) : setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ roundDate, view: nextView, take: '25' });
      if (cursor) params.set('cursor', cursor);
      const next = await responseJson(await fetch(`/api/admin/guess-36?${params}`, { cache: 'no-store' })) as Guess36AdminData;
      setData((current) => cursor && current
        ? { ...next, items: [...current.items, ...next.items] }
        : next);
      setView(nextView);
      setDateDraft(roundDate);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Guess 36 data could not be loaded.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const saveConfig = async (kind: 'availability' | 'modes' | 'rewards') => {
    if (savingConfig) return;
    let update;
    try {
      update = kind === 'availability' ? { enabled: configDraft }
        : kind === 'modes' ? { enabledModes: modesDraft }
          : { rewards: rewardsFromDraft(rewardsDraft) };
    }
    catch (validationError) { setModalError(validationError instanceof Error ? validationError.message : 'Check the reward values.'); return; }
    setSavingConfig(true);
    setModalError('');
    try {
      const next = await responseJson(await fetch('/api/admin/guess-36/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      }));
      setConfig(next);
      setConfigOpen(false);
      setModesOpen(false);
      setRewardsOpen(false);
      setSuccess(kind === 'availability' ? `Guess 36 ${next.enabled ? 'enabled' : 'paused'}.`
        : kind === 'modes' ? 'Player pick types updated.'
          : `Rewards saved for rounds from ${formatRoundDate(next.effectiveFrom)}.`);
      if (data && kind === 'availability') await loadData(view, data.round.date);
    } catch (saveError) {
      setModalError(saveError instanceof Error ? saveError.message : 'Could not save Guess 36 settings.');
    } finally {
      setSavingConfig(false);
    }
  };

  const generateResult = async () => {
    if (!drawDate || drawing) return;
    setDrawing(true);
    setModalError('');
    try {
      const response = await fetch('/api/admin/guess-36/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundDate: drawDate }),
      });
      const result = await responseJson(response);
      setDrawDate(null);
      setSuccess(`Guess 36 result ${result.result.winningNumber} locked with ${result.result.winnerCount} winner${result.result.winnerCount === 1 ? '' : 's'}.`);
      await loadData(view, drawDate);
    } catch (drawError) {
      setModalError(drawError instanceof Error ? drawError.message : 'Could not generate the result.');
    } finally {
      setDrawing(false);
    }
  };

  const redeemTicket = async (item: Guess36AdminItem) => {
    if (!item.ticket || redeemingId) return;
    setRedeemingId(item.ticket.id);
    setError('');
    try {
      const result = await responseJson(await fetch(`/api/admin/guess-36/rewards/${item.ticket.id}/redeem`, { method: 'POST' }));
      setData((current) => current ? {
        ...current,
        items: current.items.map((entry) => entry.id === item.id ? { ...entry, ticket: result.ticket } : entry),
      } : current);
      setSuccess(`${item.name}'s Reward Ticket marked claimed.`);
    } catch (redeemError) {
      setError(redeemError instanceof Error ? redeemError.message : 'Could not mark the ticket claimed.');
    } finally {
      setRedeemingId(null);
    }
  };

  const applyDate = (event: FormEvent) => {
    event.preventDefault();
    if (dateDraft) void loadData(view, dateDraft);
  };

  return (
    <div className="guess-36-admin">
      <header className="guess-36-admin-heading">
        <div>
          <span>Daily Side Quest</span>
          <h1>Guess 36</h1>
          <p>Manage daily picks, tier rewards, and counter tickets.</p>
        </div>
        <Target size={34} aria-hidden="true" />
      </header>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      {data ? (
        <>
          <section className="guess-36-admin-stats" aria-label="Guess 36 overview">
            <article><Users size={18} /><span>Today</span><strong>{data.summary.today.participants}</strong><small>participants</small></article>
            <article><Clock3 size={18} /><span>Status</span><strong className="word">{data.summary.today.status}</strong><small>{data.summary.today.date}</small></article>
            <article><Target size={18} /><span>Previous Number</span><strong>{data.summary.previous.winningNumber ?? '-'}</strong><small>{data.summary.previous.status}</small></article>
            <article><Trophy size={18} /><span>Previous Winners</span><strong>{data.summary.previous.winnerCount}</strong><small>{data.summary.previous.date}</small></article>
          </section>

          <section className="guess-36-admin-config-card">
            <div className={`guess-36-availability-icon ${config.enabled ? 'enabled' : 'paused'}`}><Clock3 size={20} /></div>
            <div><span>Daily Entry</span><h2>Guess 36 Availability</h2><p>New entries are currently {config.enabled ? 'open' : 'paused'}.</p></div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setModalError(''); setConfigDraft(config.enabled); setConfigOpen(true); }}><Edit3 size={15} /> Edit</button>
          </section>

          <section className="guess-36-admin-config-card rewards">
            <div className="guess-36-availability-icon"><Trophy size={20} /></div>
            <div><span>Three chances</span><h2>Reward Tiers</h2><p>Edits start {config.effectiveFrom && formatRoundDate(config.effectiveFrom)}. Today&apos;s rewards stay fixed.</p></div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setModalError(''); setRewardsDraft(rewardDrafts(config.rewards)); setRewardsOpen(true); }}><Edit3 size={15} /> Edit Rewards</button>
            <dl className="guess-36-tier-summary">
              {GUESS_36_TIERS.map((tier) => <div key={tier.id}><dt>{tier.label}<small>{tier.chance} chance</small></dt><dd>{config.rewards[tier.id].name}
                {config.rewards[tier.id].name !== config.todayRewards[tier.id].name && <small>Today: {config.todayRewards[tier.id].name}</small>}
              </dd></div>)}
            </dl>
          </section>

          <section className="guess-36-admin-config-card">
            <div className="guess-36-availability-icon"><Grid3X3 size={20} /></div>
            <div><span>Player Options</span><h2>Visible Pick Types</h2><p>{config.enabledModes.map((mode) => PICK_TYPES.find((item) => item.id === mode)?.label).join(', ')}</p></div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setModalError(''); setModesDraft(config.enabledModes); setModesOpen(true); }}><Edit3 size={15} /> Edit Types</button>
          </section>

          {data.summary.previous.status === 'PENDING' && (
            <section className="guess-36-draw-reminder">
              <div><Target size={20} /><span><strong>{data.summary.previous.date} needs a result</strong><small>Use this only if the automatic midnight draw was missed.</small></span></div>
              <button className="btn btn-primary btn-sm" type="button" onClick={() => { setModalError(''); setDrawDate(data.summary.previous.date); }}>Generate Result</button>
            </section>
          )}

          <section className="guess-36-admin-browser">
            <form className="guess-36-date-filter" onSubmit={applyDate}>
              <label htmlFor="guess-36-round-date"><CalendarDays size={16} /> Round date</label>
              <div>
                <input id="guess-36-round-date" className="form-input" type="date" value={dateDraft} max={data.summary.today.date} onChange={(event) => setDateDraft(event.target.value)} />
                <button className="btn btn-secondary" type="submit" disabled={loading || !dateDraft}>{loading ? 'Loading...' : 'Apply'}</button>
              </div>
            </form>

            <div className="guess-36-admin-tabs" role="tablist" aria-label="Guess 36 records">
              <button role="tab" aria-selected={view === 'entries'} onClick={() => void loadData('entries', data.round.date)}><Users size={16} /> Entries</button>
              <button role="tab" aria-selected={view === 'winners'} onClick={() => void loadData('winners', data.round.date)}><Trophy size={16} /> Winners</button>
            </div>

            <div className="guess-36-round-strip">
              <span><strong>{data.round.date}</strong><small>{data.round.participantCount} entries</small></span>
              <span className={`guess-36-status ${statusClass(data.round.status)}`}>{data.round.status}</span>
              {data.round.status === 'DRAWN' ? (
                <span className="guess-36-round-number">Guess 36 result <strong>{data.round.winningNumber}</strong></span>
              ) : data.round.date < data.summary.today.date ? (
                <button className="btn btn-primary btn-sm" type="button" onClick={() => { setModalError(''); setDrawDate(data.round.date); }}>Draw</button>
              ) : null}
            </div>

            {loading ? (
              <div className="loading-state"><span className="spinner" /> Loading Guess 36...</div>
            ) : data.items.length === 0 ? (
              <div className="guess-36-admin-empty"><Target size={28} /><strong>No {view} for this round</strong><span>{view === 'winners' && data.round.status !== 'DRAWN' ? 'Generate the result first.' : 'Records will appear here.'}</span></div>
            ) : (
              <div className="guess-36-record-list">
                {data.items.map((item) => (
                  <article key={item.id} className="guess-36-record-row">
                    <div className="guess-36-record-number">{item.selection.type === 'NUMBER' ? item.selection.value : guess36SelectionLabel(item.selection)}</div>
                    <div className="guess-36-record-person"><strong>{item.name}</strong><span>{item.phone} / {formatTime(item.enteredAt)}</span><small>{GUESS_36_TIERS.find((tier) => tier.id === item.tier)?.label} / {item.reward.name}</small></div>
                    {view === 'winners' && item.ticket && (
                      <div className="guess-36-record-ticket">
                        <span>{item.ticket.code}</span>
                        <small>Expires {formatTime(item.ticket.expiresAt)}</small>
                      </div>
                    )}
                    {view === 'winners' && item.reward.type === 'EMIC' && (
                      <span className="guess-36-wallet-credit"><Coins size={14} /> Credited to wallet</span>
                    )}
                    {view === 'winners' && item.ticket && (
                      item.ticket.status === 'UNUSED'
                        ? <button className="btn btn-primary btn-sm" type="button" onClick={() => void redeemTicket(item)} disabled={redeemingId === item.ticket?.id}>{redeemingId === item.ticket.id ? 'Saving...' : <><TicketCheck size={15} /> Mark Claimed</>}</button>
                        : <span className={`guess-36-ticket-label ${item.ticket.status.toLowerCase()}`}><CheckCircle2 size={14} /> {item.ticket.status === 'REDEEMED' ? 'Claimed' : 'Expired'}</span>
                    )}
                  </article>
                ))}
              </div>
            )}

            {data.nextCursor && (
              <button className="btn btn-ghost guess-36-load-more" type="button" onClick={() => void loadData(view, data.round.date, data.nextCursor!)} disabled={loadingMore}>
                <RefreshCw size={15} /> {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            )}
          </section>
        </>
      ) : (
        <div className="guess-36-admin-empty"><Target size={28} /><strong>Guess 36 could not load</strong><button className="btn btn-secondary" onClick={() => window.location.reload()}><RefreshCw size={16} /> Retry</button></div>
      )}

      {configOpen && (
        <AdminModalShell onClose={() => !savingConfig && setConfigOpen(false)} labelledBy="guess-36-config-title" lightweight>
          <div className="guess-36-admin-modal">
            <header><div><span>Availability</span><h2 id="guess-36-config-title">Edit Guess 36</h2></div><button className="btn btn-ghost btn-sm" onClick={() => setConfigOpen(false)} disabled={savingConfig} aria-label="Close availability editor"><X size={18} /></button></header>
            <p>Pausing blocks only new picks. Existing entries, results, and Reward Tickets remain available.</p>
            <div className="guess-36-toggle-options" role="group" aria-label="Guess 36 availability">
              <button type="button" aria-pressed={configDraft} className={configDraft ? 'selected' : ''} onClick={() => setConfigDraft(true)} disabled={savingConfig}><CheckCircle2 size={20} /><strong>Enabled</strong><span>Accept today&apos;s picks</span></button>
              <button type="button" aria-pressed={!configDraft} className={!configDraft ? 'selected paused' : ''} onClick={() => setConfigDraft(false)} disabled={savingConfig}><Clock3 size={20} /><strong>Paused</strong><span>Stop new picks</span></button>
            </div>
            {modalError && <div className="alert alert-error" role="alert">{modalError}</div>}
            <div className="guess-36-modal-actions"><button className="btn btn-ghost" onClick={() => setConfigOpen(false)} disabled={savingConfig}>Cancel</button><button className="btn btn-primary" onClick={() => void saveConfig('availability')} disabled={savingConfig}><Save size={16} /> {savingConfig ? 'Saving...' : 'Save'}</button></div>
          </div>
        </AdminModalShell>
      )}

      {rewardsOpen && (
        <AdminModalShell onClose={() => !savingConfig && setRewardsOpen(false)} labelledBy="guess-36-rewards-title" lightweight>
          <form className="guess-36-admin-modal" onSubmit={(event) => { event.preventDefault(); void saveConfig('rewards'); }}>
            <header><div><span>Reward Tiers</span><h2 id="guess-36-rewards-title">Edit Rewards</h2></div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRewardsOpen(false)} disabled={savingConfig} aria-label="Close rewards editor"><X size={18} /></button></header>
            <p>Applies from {formatRoundDate(config.effectiveFrom)} (IST). Today&apos;s picks keep their original rewards.</p>
            <div className="guess-36-reward-editor">
              {GUESS_36_TIERS.map((tier) => {
                const draft = rewardsDraft[tier.id];
                const isPass = draft.type === 'PASS';
                const isEmic = draft.type === 'EMIC';
                return <fieldset key={tier.id} disabled={savingConfig}>
                  <legend>{tier.label} <span>{tier.chance}</span></legend>
                  <label htmlFor={`reward-type-${tier.id}`}>Reward Type
                    <select id={`reward-type-${tier.id}`} className="form-input" value={draft.type} onChange={(event) => {
                      const type = event.target.value as Guess36Reward['type'];
                      setRewardsDraft((current) => ({ ...current, [tier.id]: { type, value: type === 'PASS' || current[tier.id].type === 'PASS' ? '' : current[tier.id].value } }));
                    }}><option value="GAMING_TIME">Gaming Time</option><option value="RACING_TIME">Racing Time</option><option value="DISCOUNT">Discount</option><option value="PASS">Pass</option><option value="EMIC">EMIC Coins</option></select>
                  </label>
                  <label htmlFor={`reward-value-${tier.id}`}>{isPass ? 'Pass Name' : isEmic ? 'EMIC Amount' : draft.type === 'DISCOUNT' ? 'Percentage' : 'Minutes'}
                    <input id={`reward-value-${tier.id}`} className="form-input" type={isPass ? 'text' : 'number'} inputMode={isPass ? 'text' : 'numeric'} required
                      min={isPass ? undefined : 1} max={isPass ? undefined : draft.type === 'DISCOUNT' ? 100 : isEmic ? 1000000 : 10000} step={isPass ? undefined : 1}
                      maxLength={isPass ? 80 : undefined} value={draft.value} onChange={(event) => setRewardsDraft((current) => ({ ...current, [tier.id]: { ...current[tier.id], value: event.target.value } }))} />
                  </label>
                </fieldset>;
              })}
            </div>
            {modalError && <div className="alert alert-error" role="alert">{modalError}</div>}
            <div className="guess-36-modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setRewardsOpen(false)} disabled={savingConfig}>Cancel</button><button type="submit" className="btn btn-primary" disabled={savingConfig}><Save size={16} /> {savingConfig ? 'Saving...' : 'Save Rewards'}</button></div>
          </form>
        </AdminModalShell>
      )}

      {modesOpen && (
        <AdminModalShell onClose={() => !savingConfig && setModesOpen(false)} labelledBy="guess-36-modes-title" lightweight>
          <div className="guess-36-admin-modal">
            <header><div><span>Player Options</span><h2 id="guess-36-modes-title">Choose Pick Types</h2></div><button className="btn btn-ghost btn-sm" onClick={() => setModesOpen(false)} disabled={savingConfig} aria-label="Close pick types editor"><X size={18} /></button></header>
            <p>Choose which tabs players can use. Existing confirmed picks and historical results stay unchanged.</p>
            <div className="guess-36-mode-options" role="group" aria-label="Visible Guess 36 pick types">
              {PICK_TYPES.map((item) => {
                const selected = modesDraft.includes(item.id);
                return <button key={item.id} type="button" aria-pressed={selected} className={selected ? 'selected' : ''} disabled={savingConfig} onClick={() => {
                  if (selected && modesDraft.length === 1) {
                    setModalError('Keep at least one pick type enabled.');
                    return;
                  }
                  setModalError('');
                  setModesDraft((current) => selected ? current.filter((mode) => mode !== item.id) : [...current, item.id]);
                }}><Grid3X3 size={19} /><strong>{item.label}</strong><span>{item.description}</span></button>;
              })}
            </div>
            {modalError && <div className="alert alert-error" role="alert">{modalError}</div>}
            <div className="guess-36-modal-actions"><button className="btn btn-ghost" onClick={() => setModesOpen(false)} disabled={savingConfig}>Cancel</button><button className="btn btn-primary" onClick={() => void saveConfig('modes')} disabled={savingConfig}><Save size={16} /> {savingConfig ? 'Saving...' : 'Save Types'}</button></div>
          </div>
        </AdminModalShell>
      )}

      {drawDate && (
        <AdminModalShell onClose={() => !drawing && setDrawDate(null)} labelledBy="guess-36-draw-title" describedBy="guess-36-draw-description" lightweight>
          <div className="guess-36-admin-modal draw">
            <header><div><span>Permanent Result</span><h2 id="guess-36-draw-title">Generate Guess 36 result?</h2></div><button className="btn btn-ghost btn-sm" onClick={() => setDrawDate(null)} disabled={drawing} aria-label="Close draw confirmation"><X size={18} /></button></header>
            <div className="guess-36-draw-icon"><Target size={30} /></div>
            <p id="guess-36-draw-description">Draw a secure number from 1-36 for <strong>{drawDate}</strong>. Once generated, it can never be changed. EMIC rewards are credited to winners&apos; wallets; other rewards create counter Reward Tickets.</p>
            {modalError && <div className="alert alert-error" role="alert">{modalError}</div>}
            <div className="guess-36-modal-actions"><button className="btn btn-ghost" onClick={() => setDrawDate(null)} disabled={drawing}>Cancel</button><button className="btn btn-primary" onClick={generateResult} disabled={drawing}>{drawing ? <><span className="spinner guess-36-admin-spinner" /> Drawing...</> : 'Generate Result'}</button></div>
          </div>
        </AdminModalShell>
      )}

      <style jsx>{`
        .guess-36-admin { display: grid; gap: 16px; min-width: 0; }
        .guess-36-admin :global(.btn-primary) { background: #67e8f9; color: #082029; box-shadow: none; }
        .guess-36-admin-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; color: #67e8f9; }
        .guess-36-admin-heading span { font-size: .68rem; font-weight: 850; text-transform: uppercase; }
        .guess-36-admin-heading h1 { margin: 3px 0; color: var(--color-text-primary); font-size: 1.45rem; }
        .guess-36-admin-heading p { margin: 0; color: var(--color-text-secondary); font-size: .85rem; }
        .guess-36-admin-stats { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 9px; }
        .guess-36-admin-stats article { min-width: 0; min-height: 112px; display: grid; align-content: center; gap: 2px; padding: 12px; border: 1px solid #27374a; border-radius: 7px; background: #101824; color: #67e8f9; }
        .guess-36-admin-stats span { color: var(--color-text-muted); font-size: .68rem; }
        .guess-36-admin-stats strong { color: #edf6ff; font-size: 1.4rem; }
        .guess-36-admin-stats strong.word { font-family: inherit; font-size: .9rem; }
        .guess-36-admin-stats small { color: var(--color-text-secondary); font-size: .67rem; }
        .guess-36-admin-config-card { display: grid; grid-template-columns: auto minmax(0,1fr) auto; gap: 12px; align-items: center; padding: 13px; border: 1px solid #27374a; border-radius: 7px; background: #101824; }
        .guess-36-availability-icon { width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid rgba(34,197,94,.45); border-radius: 7px; background: rgba(34,197,94,.1); color: #86efac; }
        .guess-36-availability-icon.paused { border-color: rgba(251,191,36,.4); background: rgba(146,64,14,.16); color: #fde68a; }
        .guess-36-admin-config-card span { color: #67e8f9; font-size: .65rem; font-weight: 850; text-transform: uppercase; }
        .guess-36-admin-config-card h2 { margin: 2px 0; font-size: .95rem; }
        .guess-36-admin-config-card p { margin: 0; color: var(--color-text-muted); font-size: .73rem; }
        .guess-36-tier-summary { grid-column: 1 / -1; display: grid; gap: 9px; margin: 0; padding-top: 10px; border-top: 1px solid #27374a; }
        .guess-36-tier-summary > div { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 12px; align-items: start; }
        .guess-36-tier-summary dt { color: #dbeafe; font-size: .78rem; }
        .guess-36-tier-summary dd { margin: 0; color: #86efac; text-align: right; font-size: .78rem; font-weight: 700; overflow-wrap: anywhere; }
        .guess-36-tier-summary small { display: block; color: #a6b6c9; font-size: .68rem; font-weight: 400; }
        .guess-36-draw-reminder { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 13px; border: 1px solid rgba(250,204,21,.38); border-left: 3px solid #facc15; background: rgba(113,63,18,.15); }
        .guess-36-draw-reminder > div { min-width: 0; display: flex; align-items: center; gap: 9px; color: #fde68a; }
        .guess-36-draw-reminder span { display: grid; min-width: 0; }
        .guess-36-draw-reminder strong { color: #fef3c7; font-size: .82rem; }
        .guess-36-draw-reminder small { color: #b8a681; font-size: .7rem; }
        .guess-36-admin-browser { min-width: 0; display: grid; gap: 12px; }
        .guess-36-date-filter { display: grid; gap: 6px; }
        .guess-36-date-filter label { display: flex; align-items: center; gap: 6px; color: var(--color-text-secondary); font-size: .75rem; font-weight: 750; }
        .guess-36-date-filter > div { display: grid; grid-template-columns: minmax(0,220px) auto; gap: 8px; }
        .guess-36-admin-tabs { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #27374a; border-radius: 7px; overflow: hidden; }
        .guess-36-admin-tabs button { min-height: 46px; display: flex; align-items: center; justify-content: center; gap: 7px; border: 0; border-right: 1px solid #27374a; background: #101824; color: var(--color-text-secondary); font: inherit; font-size: .8rem; font-weight: 800; cursor: pointer; }
        .guess-36-admin-tabs button:last-child { border-right: 0; }
        .guess-36-admin-tabs button[aria-selected="true"] { background: rgba(8,145,178,.12); color: #67e8f9; }
        .guess-36-round-strip { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #27374a; background: #0d1521; }
        .guess-36-round-strip > span:first-child { display: grid; margin-right: auto; }
        .guess-36-round-strip small { color: var(--color-text-muted); font-size: .68rem; }
        .guess-36-status, .guess-36-ticket-label, .guess-36-wallet-credit { display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; border: 1px solid #395169; border-radius: 4px; color: #bae6fd; font-size: .65rem; font-weight: 850; }
        .guess-36-status.drawn, .guess-36-ticket-label.redeemed, .guess-36-wallet-credit { border-color: rgba(34,197,94,.45); color: #86efac; }
        .guess-36-status.closed, .guess-36-status.paused, .guess-36-ticket-label.expired { border-color: rgba(251,113,133,.4); color: #fda4af; }
        .guess-36-round-number { color: var(--color-text-muted); font-size: .7rem; }
        .guess-36-round-number strong { color: #fde68a; font-size: 1rem; }
        .guess-36-record-list { display: grid; gap: 7px; }
        .guess-36-record-row { min-width: 0; display: grid; grid-template-columns: 76px minmax(140px,1fr) minmax(150px,.7fr) auto; gap: 10px; align-items: center; padding: 9px 10px; border: 1px solid #27374a; border-radius: 6px; background: #101824; }
        .guess-36-record-number { min-height: 44px; display: grid; place-items: center; padding: 4px; border: 1px solid #67e8f9; border-radius: 6px; background: #102c37; color: #cffafe; font-size: .78rem; font-weight: 800; }
        .guess-36-record-person, .guess-36-record-ticket { min-width: 0; display: grid; }
        .guess-36-record-person strong { font-size: .82rem; overflow-wrap: anywhere; }
        .guess-36-record-person small { color: #86efac; font-size: .72rem; overflow-wrap: anywhere; }
        .guess-36-record-person span, .guess-36-record-ticket small { color: var(--color-text-muted); font-size: .68rem; }
        .guess-36-record-ticket span { color: #fde68a; font-size: .72rem; font-weight: 750; overflow-wrap: anywhere; }
        .guess-36-admin-empty { min-height: 180px; display: grid; place-content: center; justify-items: center; gap: 5px; border: 1px dashed #27374a; color: #67e8f9; text-align: center; }
        .guess-36-admin-empty strong { color: #dbeafe; font-size: .85rem; }
        .guess-36-admin-empty span { color: var(--color-text-muted); font-size: .72rem; }
        .guess-36-load-more { justify-self: center; }
        .guess-36-admin-modal { min-width: 0; display: grid; gap: 16px; padding: 19px; }
        .guess-36-admin-modal header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .guess-36-admin-modal header span { color: #67e8f9; font-size: .65rem; font-weight: 850; text-transform: uppercase; }
        .guess-36-admin-modal h2 { margin: 3px 0 0; font-size: 1.15rem; }
        .guess-36-admin-modal > p { margin: 0; color: var(--color-text-secondary); font-size: .82rem; }
        .guess-36-reward-editor { display: grid; gap: 16px; min-width: 0; }
        .guess-36-reward-editor fieldset { margin: 0; padding: 8px 0 0; border: 0; border-top: 1px solid #30435b; min-width: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
        .guess-36-reward-editor legend { padding-right: 8px; font-size: .84rem; color: #67e8f9; font-weight: 750; }
        .guess-36-reward-editor legend span { margin-left: 8px; color: #a6b6c9; font-size: .7rem; }
        .guess-36-reward-editor label { min-width: 0; display: grid; gap: 5px; font-size: .73rem; color: #cbd5e1; }
        .guess-36-reward-editor input, .guess-36-reward-editor select { width: 100%; min-width: 0; min-height: 44px; font-size: .85rem; padding-inline: 9px; }
        .guess-36-admin button:focus-visible { outline: 2px solid #67e8f9; outline-offset: 2px; }
        .guess-36-toggle-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .guess-36-toggle-options button { min-height: 100px; display: grid; place-items: center; align-content: center; gap: 3px; border: 1px solid #30435b; border-radius: 7px; background: #101824; color: var(--color-text-secondary); font: inherit; cursor: pointer; }
        .guess-36-toggle-options button.selected { border: 2px solid #22c55e; background: rgba(20,83,45,.18); color: #86efac; }
        .guess-36-toggle-options button.selected.paused { border-color: #f59e0b; background: rgba(120,53,15,.18); color: #fde68a; }
        .guess-36-toggle-options strong { color: inherit; font-size: .85rem; }
        .guess-36-toggle-options span { color: var(--color-text-muted); font-size: .68rem; }
        .guess-36-mode-options { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }
        .guess-36-mode-options button { min-width: 0; min-height: 112px; display: grid; place-items: center; align-content: center; gap: 4px; padding: 10px 6px; border: 1px solid #30435b; border-radius: 7px; background: #101824; color: var(--color-text-secondary); font: inherit; text-align: center; cursor: pointer; }
        .guess-36-mode-options button.selected { border: 2px solid #67e8f9; background: #123643; color: #cffafe; }
        .guess-36-mode-options strong { color: inherit; font-size: .78rem; }
        .guess-36-mode-options span { color: var(--color-text-muted); font-size: .65rem; }
        .guess-36-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .guess-36-modal-actions button { min-height: 44px; }
        .guess-36-draw-icon { width: 72px; height: 72px; display: grid; place-items: center; justify-self: center; border: 1px solid rgba(250,204,21,.45); border-radius: 7px; background: rgba(113,63,18,.16); color: #fde68a; }
        .guess-36-admin-spinner { width: 15px; height: 15px; border-width: 2px; }
        @media (max-width: 700px) {
          .guess-36-admin-stats { grid-template-columns: 1fr 1fr; }
          .guess-36-admin-stats article { min-height: 98px; }
          .guess-36-record-row { grid-template-columns: 76px minmax(0,1fr) auto; }
          .guess-36-record-ticket { grid-column: 2 / -1; }
          .guess-36-record-row > button, .guess-36-ticket-label, .guess-36-wallet-credit { grid-column: 2 / -1; justify-self: start; }
        }
        @media (max-width: 430px) {
          .guess-36-admin-heading svg { display: none; }
          .guess-36-admin-config-card { grid-template-columns: auto minmax(0,1fr); }
          .guess-36-admin-config-card > button { grid-column: 1 / -1; width: 100%; min-height: 42px; }
          .guess-36-draw-reminder { align-items: stretch; flex-direction: column; }
          .guess-36-draw-reminder > button { min-height: 44px; }
          .guess-36-date-filter > div { grid-template-columns: minmax(0,1fr) auto; }
          .guess-36-round-strip { flex-wrap: wrap; }
          .guess-36-round-strip > span:first-child { width: 100%; }
          .guess-36-record-row { grid-template-columns: 68px minmax(0,1fr); }
          .guess-36-record-ticket, .guess-36-record-row > button, .guess-36-ticket-label, .guess-36-wallet-credit { grid-column: 1 / -1; }
          .guess-36-record-row > button { width: 100%; min-height: 42px; }
          .guess-36-toggle-options { grid-template-columns: 1fr; }
          .guess-36-mode-options { grid-template-columns: 1fr; }
          .guess-36-modal-actions { display: grid; grid-template-columns: 1fr 1.35fr; }
          .guess-36-modal-actions button { min-width: 0; }
          .guess-36-reward-editor fieldset { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) { .guess-36-admin-spinner { animation: none; } }
      `}</style>
    </div>
  );
}
