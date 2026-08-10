'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Gem,
  RefreshCw,
  Save,
  Search,
  Store,
  Trash2,
  Users,
  X,
} from 'lucide-react';

type MarketplaceSettings = {
  enabled: boolean;
  gemCost: number;
  durationHours: number;
};

type Artifact = {
  id: string;
  name: string;
  slotType: string;
  set: {
    name: string;
    rarity: string;
  };
};

type Listing = {
  id: string;
  status: string;
  gemCost: number;
  expiresAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  seller: { id: string; name: string; email: string };
  buyer: { id: string; name: string; email: string } | null;
  offeredArtifact: Artifact;
  requestedArtifact: Artifact;
};

type MarketplaceState = {
  settings: MarketplaceSettings;
  summary: Record<'OPEN' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED', number>;
  listings: Listing[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type GemUser = {
  id: string;
  name: string;
  email: string;
  guildGems: number;
};

type GemLedgerEntry = {
  id: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
};

type GemAccount = GemUser & {
  ledger: GemLedgerEntry[];
};

const STATUS_OPTIONS = ['ALL', 'OPEN', 'COMPLETED', 'EXPIRED', 'CANCELLED'] as const;
const RARITY_COLORS: Record<string, string> = {
  BRONZE: '#d58a52',
  SILVER: '#8edbed',
  GOLD: '#f4cf58',
  PLATINUM: '#c7a7ff',
};

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function formatIst(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function artifactLabel(artifact: Artifact) {
  return (
    <div className="admin-market-artifact">
      <strong style={{ color: RARITY_COLORS[artifact.set.rarity] }}>
        {artifact.name}
      </strong>
      <span>{artifact.set.rarity} · {artifact.slotType.toLowerCase()}</span>
    </div>
  );
}

export function AdminArmoryMarketplace() {
  const [view, setView] = useState<'trades' | 'gems'>('trades');
  const [state, setState] = useState<MarketplaceState | null>(null);
  const [settings, setSettings] = useState<MarketplaceSettings>({
    enabled: true,
    gemCost: 1,
    durationHours: 24,
  });
  const [status, setStatus] = useState('OPEN');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [listingToRemove, setListingToRemove] = useState<Listing | null>(null);
  const requestRef = useRef(0);
  const removeConfirmRef = useRef<HTMLButtonElement>(null);

  const loadTrades = async (
    page = 1,
    nextStatus = status,
    nextSearch = search,
  ) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        status: nextStatus,
        search: nextSearch,
        page: String(page),
        limit: '20',
      });
      const response = await fetch(`/api/admin/armory/marketplace?${params}`, {
        cache: 'no-store',
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load Artifact Exchange administration.');
      }
      if (requestId === requestRef.current) {
        setState(data);
        setSettings(data.settings);
      }
    } catch (loadError) {
      if (requestId === requestRef.current) {
        setError(loadError instanceof Error
          ? loadError.message
          : 'Failed to load Artifact Exchange administration.');
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadTrades(1, status, search);
  }, [status, search]);

  useEffect(() => {
    if (!listingToRemove) return;
    removeConfirmRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setListingToRemove(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, listingToRemove]);

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const saveSettings = async () => {
    setBusy('settings');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/armory/marketplace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save Artifact Exchange settings.');
      }
      setSettings(data.settings);
      setState((current) => current
        ? { ...current, settings: data.settings }
        : current);
      setNotice('Artifact Exchange settings saved. Existing listings were not changed.');
    } catch (saveError) {
      setError(saveError instanceof Error
        ? saveError.message
        : 'Failed to save Artifact Exchange settings.');
    } finally {
      setBusy('');
    }
  };

  const removeListing = async (listing: Listing) => {
    setBusy(listing.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/admin/armory/marketplace/${listing.id}`,
        { method: 'DELETE' },
      );
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove Artifact Exchange listing.');
      }
      setNotice('Listing removed and the artifact was returned to the seller.');
      setListingToRemove(null);
      await loadTrades(state?.pagination.page ?? 1);
    } catch (removeError) {
      setError(removeError instanceof Error
        ? removeError.message
        : 'Failed to remove Artifact Exchange listing.');
      setListingToRemove(null);
    } finally {
      setBusy('');
    }
  };

  const summary = state?.summary ?? {
    OPEN: 0,
    COMPLETED: 0,
    EXPIRED: 0,
    CANCELLED: 0,
  };

  return (
    <div className="admin-marketplace">
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <section className="admin-market-settings" aria-labelledby="market-settings-title">
        <div>
          <h3 id="market-settings-title"><Store size={17} /> Artifact Exchange Settings</h3>
          <p>Changes apply only to listings created after saving.</p>
        </div>
        <div className="admin-market-setting-fields">
          <label className="admin-market-toggle">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings((current) => ({
                ...current,
                enabled: event.target.checked,
              }))}
            />
            <span>Artifact Exchange enabled</span>
          </label>
          <label>
            <span>Trade cost per user</span>
            <div className="admin-market-number">
              <input
                className="form-input"
                type="number"
                min="1"
                max="100"
                value={settings.gemCost}
                onChange={(event) => setSettings((current) => ({
                  ...current,
                  gemCost: Number(event.target.value),
                }))}
              />
              <small>Gems</small>
            </div>
          </label>
          <label>
            <span>Listing expiry</span>
            <div className="admin-market-number">
              <input
                className="form-input"
                type="number"
                min="1"
                max="168"
                value={settings.durationHours}
                onChange={(event) => setSettings((current) => ({
                  ...current,
                  durationHours: Number(event.target.value),
                }))}
              />
              <small>Hours</small>
            </div>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={saveSettings}
            disabled={Boolean(busy)}
          >
            <Save size={15} /> {busy === 'settings' ? 'Saving...' : 'Save'}
          </button>
        </div>
      </section>

      <div className="admin-market-view-tabs" role="tablist" aria-label="Artifact Exchange administration">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'trades'}
          className={view === 'trades' ? 'active' : ''}
          onClick={() => setView('trades')}
        >
          <Store size={15} /> Trades
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'gems'}
          className={view === 'gems' ? 'active' : ''}
          onClick={() => setView('gems')}
        >
          <Gem size={15} /> Guild Gems
        </button>
      </div>

      {view === 'trades' ? (
        <section>
          <div className="admin-market-summary" aria-label="Artifact Exchange listing totals">
            {(['OPEN', 'COMPLETED', 'EXPIRED', 'CANCELLED'] as const).map((key) => (
              <button
                type="button"
                key={key}
                className={status === key ? 'active' : ''}
                onClick={() => setStatus(key)}
              >
                <strong>{summary[key]}</strong>
                <span>{key.toLowerCase()}</span>
              </button>
            ))}
          </div>

          <div className="admin-market-toolbar">
            <select
              className="form-input"
              aria-label="Filter Artifact Exchange status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'ALL' ? 'All statuses' : option}
                </option>
              ))}
            </select>
            <form onSubmit={applySearch}>
              <Search size={16} />
              <input
                className="form-input"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="User, email, or artifact"
                aria-label="Search Artifact Exchange listings"
              />
              <button className="btn btn-ghost btn-sm" type="submit">Search</button>
            </form>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              disabled={loading}
              onClick={() => loadTrades(state?.pagination.page ?? 1)}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {loading && !state ? (
            <div className="loading-state"><div className="spinner" />Loading Artifact Exchange...</div>
          ) : state?.listings.length ? (
            <>
              <div className="admin-market-table-wrap">
                <table className="admin-market-table">
                  <thead>
                    <tr>
                      <th>Seller</th>
                      <th>Offering</th>
                      <th aria-label="Trade direction" />
                      <th>Wanted</th>
                      <th>Buyer</th>
                      <th>Cost Each</th>
                      <th>Timing</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.listings.map((listing) => (
                      <tr key={listing.id}>
                        <td>
                          <strong>{listing.seller.name}</strong>
                          <span>{listing.seller.email}</span>
                        </td>
                        <td>{artifactLabel(listing.offeredArtifact)}</td>
                        <td><ArrowRight size={15} /></td>
                        <td>{artifactLabel(listing.requestedArtifact)}</td>
                        <td>
                          {listing.buyer ? (
                            <>
                              <strong>{listing.buyer.name}</strong>
                              <span>{listing.buyer.email}</span>
                            </>
                          ) : '—'}
                        </td>
                        <td><strong>{listing.gemCost}</strong> Gem{listing.gemCost === 1 ? '' : 's'} each</td>
                        <td>
                          <span>Listed {formatIst(listing.createdAt)}</span>
                          <span>Expires {formatIst(listing.expiresAt)}</span>
                        </td>
                        <td>
                          <span className={`admin-market-status ${listing.status.toLowerCase()}`}>
                            {listing.status}
                          </span>
                        </td>
                        <td>
                          {listing.status === 'OPEN' ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title="Remove listing"
                              aria-label={`Remove ${listing.offeredArtifact.name} listing`}
                              onClick={() => setListingToRemove(listing)}
                              disabled={Boolean(busy)}
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="admin-market-pagination">
                <span>{state.pagination.total} listing{state.pagination.total === 1 ? '' : 's'}</span>
                <div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="Previous Artifact Exchange page"
                    disabled={loading || state.pagination.page <= 1}
                    onClick={() => loadTrades(state.pagination.page - 1)}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span>{state.pagination.page} / {state.pagination.totalPages}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="Next Artifact Exchange page"
                    disabled={loading || state.pagination.page >= state.pagination.totalPages}
                    onClick={() => loadTrades(state.pagination.page + 1)}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="admin-market-empty">No Artifact Exchange listings match this filter.</p>
          )}
        </section>
      ) : (
        <GuildGemManager />
      )}

      {listingToRemove && (
        <div
          className="admin-market-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setListingToRemove(null);
            }
          }}
        >
          <div
            className="admin-market-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-market-dialog-title"
            aria-describedby="admin-market-dialog-description"
          >
            <button
              type="button"
              className="admin-market-dialog-close"
              aria-label="Close confirmation"
              onClick={() => setListingToRemove(null)}
              disabled={Boolean(busy)}
            >
              <X size={18} />
            </button>
            <Trash2 size={22} />
            <h3 id="admin-market-dialog-title">Remove Open Listing?</h3>
            <p id="admin-market-dialog-description">
              Return {listingToRemove.offeredArtifact.name} to {listingToRemove.seller.name}&apos;s inventory.
              The trade history will remain available.
            </p>
            <div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setListingToRemove(null)}
                disabled={Boolean(busy)}
              >
                Keep Listing
              </button>
              <button
                ref={removeConfirmRef}
                type="button"
                className="btn btn-danger"
                onClick={() => removeListing(listingToRemove)}
                disabled={Boolean(busy)}
              >
                <Trash2 size={15} />
                {busy ? 'Removing...' : 'Remove Listing'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminMarketplaceStyles />
    </div>
  );
}

function GuildGemManager() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<GemUser[]>([]);
  const [account, setAccount] = useState<GemAccount | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestRef = useRef(0);

  useEffect(() => {
    const query = search.trim();
    const requestId = ++requestRef.current;
    if (query.length < 2) {
      setUsers([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search: query });
        const response = await fetch(
          `/api/admin/armory/marketplace/gems?${params}`,
          { cache: 'no-store' },
        );
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || 'User search failed.');
        if (requestId === requestRef.current) setUsers(data.users ?? []);
      } catch (searchError) {
        if (requestId === requestRef.current) {
          setError(searchError instanceof Error ? searchError.message : 'User search failed.');
        }
      } finally {
        if (requestId === requestRef.current) setSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const loadAccount = async (user: GemUser) => {
    setLoadingAccount(true);
    setError('');
    setNotice('');
    try {
      const params = new URLSearchParams({ userId: user.id });
      const response = await fetch(
        `/api/admin/armory/marketplace/gems?${params}`,
        { cache: 'no-store' },
      );
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Failed to load Guild Gems.');
      setAccount(data.account);
      setUsers([]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Guild Gems.');
    } finally {
      setLoadingAccount(false);
    }
  };

  const adjust = async () => {
    if (!account) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/armory/marketplace/gems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: account.id,
          amount: Number(amount),
          note,
        }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Gem adjustment failed.');
      setAccount(data.account);
      setAmount('');
      setNote('');
      setNotice('Guild Gem balance updated and recorded.');
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : 'Gem adjustment failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-gems">
      <div className="admin-gem-search">
        <label htmlFor="market-gem-user">Find user</label>
        <div>
          <Search size={17} />
          <input
            id="market-gem-user"
            className="form-input"
            type="search"
            value={search}
            placeholder="Type user name or email"
            autoComplete="off"
            onChange={(event) => {
              setSearch(event.target.value);
              setAccount(null);
              setError('');
              setNotice('');
            }}
          />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      {searching && <div className="loading-state"><div className="spinner" />Searching...</div>}

      {!searching && users.length > 0 && (
        <div className="admin-gem-users">
          {users.map((user) => (
            <button type="button" key={user.id} onClick={() => loadAccount(user)}>
              <span>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </span>
              <b><Gem size={14} /> {user.guildGems}</b>
            </button>
          ))}
        </div>
      )}

      {!searching && search.trim().length >= 2 && users.length === 0 && !account && !error && (
        <p className="admin-market-empty">No matching users.</p>
      )}

      {loadingAccount ? (
        <div className="loading-state"><div className="spinner" />Loading Gem account...</div>
      ) : account ? (
        <>
          <div className="admin-gem-account">
            <div>
              <Users size={18} />
              <span>
                <strong>{account.name}</strong>
                <small>{account.email}</small>
              </span>
            </div>
            <b><Gem size={18} /> {account.guildGems}</b>
          </div>

          <div className="admin-gem-adjustment">
            <label>
              <span>Adjustment</span>
              <input
                className="form-input"
                type="number"
                min="-10000"
                max="10000"
                step="1"
                value={amount}
                placeholder="+1 or -1"
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label>
              <span>Reason</span>
              <input
                className="form-input"
                type="text"
                minLength={3}
                maxLength={160}
                value={note}
                placeholder="Counter correction or promotion"
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                saving
                || !Number.isInteger(Number(amount))
                || Number(amount) === 0
                || note.trim().length < 3
              }
              onClick={adjust}
            >
              <Gem size={15} /> {saving ? 'Updating...' : 'Apply Adjustment'}
            </button>
          </div>

          <h3 className="admin-gem-history-title">Recent Gem Activity</h3>
          {account.ledger.length > 0 ? (
            <div className="admin-market-table-wrap">
              <table className="admin-market-table admin-gem-ledger">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Change</th>
                    <th>Balance</th>
                    <th>Source</th>
                    <th>Admin / Note</th>
                  </tr>
                </thead>
                <tbody>
                  {account.ledger.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatIst(entry.createdAt)}</td>
                      <td className={entry.amount > 0 ? 'gem-positive' : 'gem-negative'}>
                        {entry.amount > 0 ? '+' : ''}{entry.amount}
                      </td>
                      <td>{entry.balanceAfter}</td>
                      <td>{entry.reason.replaceAll('_', ' ')}</td>
                      <td>
                        <strong>{entry.actor?.name ?? 'System'}</strong>
                        {entry.note && <span>{entry.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-market-empty">No Guild Gem activity yet.</p>
          )}
        </>
      ) : search.trim().length < 2 ? (
        <p className="admin-market-empty">Enter at least 2 characters to find a user.</p>
      ) : null}
    </section>
  );
}

function AdminMarketplaceStyles() {
  return (
    <style>{`
      .admin-marketplace { display: grid; width: 100%; max-width: 100%; gap: 18px; min-width: 0; }
      .admin-marketplace > * { min-width: 0; }
      .admin-market-settings { display: grid; width: 100%; max-width: 100%; gap: 14px; padding-bottom: 18px; border-bottom: 1px solid var(--color-border); }
      .admin-market-settings h3, .admin-gem-history-title { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 1rem; }
      .admin-market-settings p { margin: 4px 0 0; color: var(--color-text-muted); font-size: 0.8rem; }
      .admin-market-setting-fields { display: grid; width: 100%; max-width: 100%; min-width: 0; grid-template-columns: minmax(170px, 1fr) 150px 150px auto; align-items: end; gap: 10px; }
      .admin-market-setting-fields > label { display: grid; gap: 6px; color: var(--color-text-secondary); font-size: 0.78rem; font-weight: 700; }
      .admin-market-toggle { min-height: 42px; grid-template-columns: 18px 1fr; align-items: center; }
      .admin-market-toggle input { width: 17px; height: 17px; accent-color: var(--color-accent-primary); }
      .admin-market-number { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px; }
      .admin-market-number .form-input { width: 100%; min-width: 0; }
      .admin-market-number small { color: var(--color-text-muted); font-size: 0.72rem; }
      .admin-market-view-tabs { display: flex; border-bottom: 1px solid var(--color-border); }
      .admin-market-view-tabs button { min-height: 40px; display: inline-flex; align-items: center; gap: 7px; padding: 0 14px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--color-text-muted); font-weight: 700; }
      .admin-market-view-tabs button.active { color: var(--color-text-primary); border-bottom-color: var(--color-accent-primary); }
      .admin-market-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 14px; border: 1px solid var(--color-border); }
      .admin-market-summary button { min-height: 58px; display: grid; place-content: center; gap: 2px; border: 0; border-right: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); text-align: center; }
      .admin-market-summary button:last-child { border-right: 0; }
      .admin-market-summary button.active { background: var(--color-bg-secondary); color: var(--color-text-primary); }
      .admin-market-summary strong { font-size: 1rem; }
      .admin-market-summary span { font-size: 0.68rem; text-transform: uppercase; }
      .admin-market-toolbar { display: grid; grid-template-columns: 170px minmax(260px, 1fr) auto; gap: 8px; align-items: center; margin-bottom: 12px; }
      .admin-market-toolbar form { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 6px; }
      .admin-market-table-wrap { width: 100%; min-width: 0; overflow-x: auto; padding-bottom: 6px; }
      .admin-market-table { width: 1100px; border-collapse: collapse; text-align: left; font-size: 0.78rem; }
      .admin-market-table th, .admin-market-table td { padding: 9px 7px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
      .admin-market-table th { color: var(--color-text-muted); font-size: 0.68rem; text-transform: uppercase; }
      .admin-market-table td > strong, .admin-market-table td > span { display: block; }
      .admin-market-table td > span { margin-top: 2px; color: var(--color-text-muted); font-size: 0.7rem; }
      .admin-market-artifact { display: grid; gap: 2px; min-width: 140px; }
      .admin-market-artifact span { color: var(--color-text-muted); font-size: 0.68rem; text-transform: capitalize; }
      .admin-market-status { width: fit-content; padding: 3px 6px; border: 1px solid var(--color-border); border-radius: 4px; font-size: 0.64rem; font-weight: 800; }
      .admin-market-status.open { color: #8edbed; }
      .admin-market-status.completed { color: #8de0aa; }
      .admin-market-status.expired, .admin-market-status.cancelled { color: var(--color-text-muted); }
      .admin-market-pagination { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; color: var(--color-text-muted); font-size: 0.78rem; }
      .admin-market-pagination > div { display: flex; align-items: center; gap: 8px; }
      .admin-market-empty { padding: 24px 4px; color: var(--color-text-muted); text-align: center; }
      .admin-market-dialog-backdrop { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 20px; background: rgba(0, 0, 0, 0.72); }
      .admin-market-dialog { position: relative; width: min(430px, 100%); display: grid; justify-items: start; gap: 11px; padding: 20px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-card); box-shadow: var(--shadow-lg); }
      .admin-market-dialog > svg { color: var(--color-accent-error); }
      .admin-market-dialog h3, .admin-market-dialog p { margin: 0; }
      .admin-market-dialog p { color: var(--color-text-secondary); line-height: 1.5; }
      .admin-market-dialog > div { width: 100%; display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
      .admin-market-dialog-close { position: absolute; top: 10px; right: 10px; width: 38px; height: 38px; display: grid; place-items: center; border: 0; background: transparent; color: var(--color-text-muted); }
      .admin-gems { display: grid; gap: 14px; }
      .admin-gem-search { display: grid; gap: 6px; max-width: 560px; }
      .admin-gem-search label, .admin-gem-adjustment label > span { color: var(--color-text-secondary); font-size: 0.78rem; font-weight: 700; }
      .admin-gem-search > div { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; gap: 7px; }
      .admin-gem-users { display: grid; max-width: 680px; }
      .admin-gem-users button { min-height: 54px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 4px; border: 0; border-bottom: 1px solid var(--color-border); background: transparent; color: var(--color-text-primary); text-align: left; }
      .admin-gem-users span, .admin-gem-users small { display: block; }
      .admin-gem-users small { margin-top: 2px; color: var(--color-text-muted); }
      .admin-gem-users b { display: inline-flex; align-items: center; gap: 5px; color: #c7a7ff; }
      .admin-gem-account { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
      .admin-gem-account > div, .admin-gem-account > b { display: flex; align-items: center; gap: 8px; }
      .admin-gem-account span, .admin-gem-account small { display: block; }
      .admin-gem-account small { margin-top: 2px; color: var(--color-text-muted); }
      .admin-gem-account > b { color: #c7a7ff; font-size: 1.15rem; }
      .admin-gem-adjustment { display: grid; grid-template-columns: 150px minmax(250px, 1fr) auto; align-items: end; gap: 10px; }
      .admin-gem-adjustment label { display: grid; gap: 6px; }
      .admin-gem-history-title { margin-top: 8px; }
      .admin-gem-ledger { width: 850px; }
      .gem-positive { color: #8de0aa; font-weight: 800; }
      .gem-negative { color: #ffaaaa; font-weight: 800; }
      @media (max-width: 1100px) {
        .admin-market-setting-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .admin-market-toolbar { grid-template-columns: 150px minmax(220px, 1fr); }
        .admin-market-toolbar > button { grid-column: 2; justify-self: end; }
        .admin-gem-adjustment { grid-template-columns: 130px minmax(220px, 1fr); }
        .admin-gem-adjustment > button { grid-column: 2; justify-self: start; }
      }
    `}</style>
  );
}
