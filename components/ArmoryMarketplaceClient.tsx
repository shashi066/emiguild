'use client';

import {
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Clock3,
  Crown,
  Footprints,
  Gem,
  Hand,
  Package,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  X,
} from 'lucide-react';

type Artifact = {
  id: string;
  setId: string;
  slotType: string;
  name: string;
  set: {
    id: string;
    name: string;
    shortLabel: string;
    rarity: string;
  };
};

type InventoryRow = {
  artifact: Artifact;
  quantity: number;
  availableQuantity: number;
};

type Listing = {
  id: string;
  status: string;
  gemCost: number;
  expiresAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  seller: { name: string };
  buyer: { name: string } | null;
  offeredArtifact: Artifact;
  requestedArtifact: Artifact;
  isOwn: boolean;
  canAccept: boolean;
};

type MarketplaceState = {
  marketplaceEnabled: boolean;
  guildGems: number;
  gemCost: number;
  durationHours: number;
  listings: Listing[];
  myListing: Listing | null;
  history: Listing[];
  inventory: InventoryRow[];
  artifacts: Artifact[];
};

type Tab = 'browse' | 'list' | 'history';
type PendingAction = {
  type: 'accept' | 'cancel';
  listing: Listing;
};

const RARITIES = ['ALL', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const;
const RARITY_COLORS: Record<string, string> = {
  BRONZE: '#c07a3d',
  SILVER: '#8edcf0',
  GOLD: '#e8cb4b',
  PLATINUM: '#b98aff',
};
const SLOT_ICONS: Record<string, typeof Shield> = {
  HEADGEAR: Crown,
  ARMOR: Shield,
  GLOVES: Hand,
  BOOTS: Footprints,
};

function slotLabel(slot: string) {
  return slot.charAt(0) + slot.slice(1).toLowerCase();
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function remainingTime(expiresAt: string, now: number) {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  if (remaining <= 0) return 'Expiring';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function ArtifactLabel({ artifact, compact = false }: { artifact: Artifact; compact?: boolean }) {
  const Icon = SLOT_ICONS[artifact.slotType] ?? Package;
  const color = RARITY_COLORS[artifact.set.rarity] ?? '#9ca3af';

  return (
    <div className={compact ? 'market-artifact compact' : 'market-artifact'}>
      <span className="market-artifact-icon" style={{ color, borderColor: `${color}66` }}>
        <Icon size={compact ? 15 : 18} />
      </span>
      <span>
        <strong>{artifact.name}</strong>
        <small>
          <b style={{ color }}>{artifact.set.rarity}</b>
          {' · '}
          {slotLabel(artifact.slotType)}
        </small>
      </span>
    </div>
  );
}

export function ArmoryMarketplaceClient({
  initialState,
  initialError = '',
}: {
  initialState: MarketplaceState | null;
  initialError?: string;
}) {
  const [state, setState] = useState<MarketplaceState | null>(initialState);
  const [tab, setTab] = useState<Tab>('browse');
  const [rarity, setRarity] = useState('ALL');
  const [offeredArtifactId, setOfferedArtifactId] = useState('');
  const [requestedArtifactId, setRequestedArtifactId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!pendingAction) return;
    const dialog = dialogRef.current;
    const confirmButton = dialog?.querySelector<HTMLButtonElement>('[data-confirm]');
    confirmButton?.focus();

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        setPendingAction(null);
        window.setTimeout(() => previousFocusRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, pendingAction]);

  useEffect(() => {
    if (!state || state.myListing) return;
    if (
      offeredArtifactId
      && !state.inventory.some((row) => row.artifact.id === offeredArtifactId)
    ) {
      setOfferedArtifactId('');
    }
  }, [offeredArtifactId, state]);

  const availableByArtifact = useMemo(
    () => new Map(
      (state?.inventory ?? []).map((row) => [
        row.artifact.id,
        row.availableQuantity,
      ]),
    ),
    [state?.inventory],
  );
  const filteredListings = useMemo(
    () => (state?.listings ?? []).filter((listing) => (
      new Date(listing.expiresAt).getTime() > now
      && (
        rarity === 'ALL'
        || listing.offeredArtifact.set.rarity === rarity
        || listing.requestedArtifact.set.rarity === rarity
      )
    )),
    [now, rarity, state?.listings],
  );

  const loadState = async () => {
    setBusy('refresh');
    setError('');
    try {
      const response = await fetch('/api/armory/marketplace', {
        cache: 'no-store',
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Artifact Exchange refresh failed.');
      setState(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Artifact Exchange refresh failed.');
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    if (
      !state
      || busy
      || !state.listings.some(
        (listing) => new Date(listing.expiresAt).getTime() <= now,
      )
    ) {
      return;
    }
    void loadState();
  }, [now]);

  const runAction = async (
    url: string,
    options: RequestInit,
    successMessage: string,
  ) => {
    setBusy(url);
    setError('');
    setNotice('');
    try {
      const response = await fetch(url, options);
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Artifact Exchange action failed.');
      setState(data);
      setNotice(successMessage);
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Artifact Exchange action failed.');
      return false;
    } finally {
      setBusy('');
    }
  };

  const createListing = async () => {
    if (!state) return;
    if (!offeredArtifactId || !requestedArtifactId) {
      setError('Choose the artifact you are offering and the artifact you want.');
      return;
    }
    const created = await runAction(
      '/api/armory/marketplace',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offeredArtifactId, requestedArtifactId }),
      },
      `Artifact listed for ${state.durationHours} hours.`,
    );
    if (created) {
      setOfferedArtifactId('');
      setRequestedArtifactId('');
    }
  };

  const openConfirmation = (action: PendingAction) => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setPendingAction(action);
  };

  const closeConfirmation = () => {
    if (busy) return;
    setPendingAction(null);
    window.setTimeout(() => {
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    }, 0);
  };

  const keepDialogFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled)',
      ),
    );
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const confirmMarketplaceAction = async () => {
    if (!pendingAction) return;
    const { listing, type } = pendingAction;
    type === 'cancel'
      ? await runAction(
        `/api/armory/marketplace/${listing.id}`,
        { method: 'DELETE' },
        'Listing removed. Your artifact is back in inventory.',
      )
      : await runAction(
        `/api/armory/marketplace/${listing.id}/accept`,
        { method: 'POST' },
        `Trade complete. ${listing.offeredArtifact.name} is now in your inventory.`,
      );
    closeConfirmation();
  };

  if (!state) {
    return (
      <main className="market-page">
        <div className="market-shell">
          <Link href="/armory" className="btn btn-ghost btn-sm market-back">
            <ArrowLeft size={16} />Back to Armory
          </Link>
          <div className="market-alert error">{error || 'Artifact Exchange unavailable.'}</div>
          <button className="market-button primary" type="button" onClick={loadState} disabled={busy === 'refresh'}>
            <RefreshCw size={16} />Retry
          </button>
        </div>
        <MarketplaceStyles />
      </main>
    );
  }

  return (
    <main className="market-page">
      <div className="market-shell">
        <header className="market-header">
          <div>
            <Link href="/armory" className="btn btn-ghost btn-sm market-back">
              <ArrowLeft size={16} />Back to Armory
            </Link>
            <h1>Artifact Exchange</h1>
          </div>
          <div className="market-header-actions">
            <span className="market-gems" aria-label={`${state.guildGems} Guild Gems`}>
              <Gem size={16} aria-hidden="true" />
              {state.guildGems}
            </span>
            <button type="button" className="market-icon-button" onClick={loadState} disabled={busy === 'refresh'} aria-label="Refresh Artifact Exchange">
              <RefreshCw size={17} />
            </button>
          </div>
        </header>

        {error && <div className="market-alert error">{error}</div>}
        {notice && <div className="market-alert success">{notice}</div>}
        {!state.marketplaceEnabled && (
          <div className="market-alert paused">
            Artifact Exchange trading is paused. Existing listings can still be removed and will continue to expire.
          </div>
        )}

        <nav className="market-tabs" aria-label="Artifact Exchange views">
          <button type="button" className={tab === 'browse' ? 'active' : ''} onClick={() => setTab('browse')}>
            <ArrowRightLeft size={16} />Browse
          </button>
          <button type="button" className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
            <Plus size={16} />My Listing
          </button>
          <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            <Clock3 size={16} />History
          </button>
        </nav>
        <p className="market-fee-note">
          A completed trade costs both traders {state.gemCost} Guild Gem{state.gemCost === 1 ? '' : 's'} each.
        </p>

        {tab === 'browse' && (
          <section className="market-section">
            <div className="market-section-heading">
              <div>
                <span>Open Trades</span>
                <h2>Available Now</h2>
              </div>
              <small>{filteredListings.length} listed</small>
            </div>
            <div className="market-filters">
              {RARITIES.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={rarity === filter ? 'active' : ''}
                  onClick={() => setRarity(filter)}
                >
                  {filter === 'ALL' ? 'All' : filter}
                </button>
              ))}
            </div>

            {filteredListings.length > 0 ? (
              <div className="market-listings">
                {filteredListings.map((listing) => {
                  const ownsRequested = (availableByArtifact.get(
                    listing.requestedArtifact.id,
                  ) ?? 0) > 0;
                  const hasGems = state.guildGems >= listing.gemCost;
                  const canAccept = listing.canAccept
                    && state.marketplaceEnabled
                    && !listing.isOwn
                    && ownsRequested
                    && hasGems;
                  const disabledReason = listing.isOwn
                    ? 'Your listing'
                    : !state.marketplaceEnabled
                      ? 'Exchange paused'
                      : !ownsRequested
                        ? `Need ${listing.requestedArtifact.name}`
                        : !hasGems
                          ? `Need ${listing.gemCost} Guild Gem${listing.gemCost === 1 ? '' : 's'}`
                          : !listing.canAccept
                            ? 'Trade unavailable'
                            : '';

                  return (
                    <article className="market-listing" key={listing.id}>
                      <div className="market-listing-meta">
                        <span>{listing.seller.name}</span>
                        <small><Clock3 size={13} />{remainingTime(listing.expiresAt, now)}</small>
                      </div>
                      <div className="market-swap">
                        <div>
                          <small>Offering</small>
                          <ArtifactLabel artifact={listing.offeredArtifact} />
                        </div>
                        <ArrowRight className="market-swap-arrow" size={20} />
                        <div>
                          <small>Wants</small>
                          <ArtifactLabel artifact={listing.requestedArtifact} />
                        </div>
                      </div>
                      {listing.isOwn ? (
                        <button type="button" className="market-button danger" onClick={() => openConfirmation({ type: 'cancel', listing })} disabled={Boolean(busy)}>
                          <Trash2 size={15} />Remove Listing
                        </button>
                      ) : (
                        <button type="button" className="market-button primary" onClick={() => openConfirmation({ type: 'accept', listing })} disabled={!canAccept || Boolean(busy)}>
                          <ArrowRightLeft size={15} />
                          {canAccept
                            ? `Trade · ${listing.gemCost} Gem${listing.gemCost === 1 ? '' : 's'} each`
                            : disabledReason}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="market-empty">
                <Package size={28} />
                <strong>No matching trades</strong>
              </div>
            )}
          </section>
        )}

        {tab === 'list' && (
          <section className="market-section">
            <div className="market-section-heading">
              <div>
                <span>Your Offer</span>
                <h2>My Listing</h2>
              </div>
              <small>One active card</small>
            </div>

            {state.myListing ? (
              <article className="market-listing own-listing">
                <div className="market-listing-meta">
                  <span>Live</span>
                  <small><Clock3 size={13} />{remainingTime(state.myListing.expiresAt, now)}</small>
                </div>
                <div className="market-swap">
                  <div>
                    <small>Offering</small>
                    <ArtifactLabel artifact={state.myListing.offeredArtifact} />
                  </div>
                  <ArrowRight className="market-swap-arrow" size={20} />
                  <div>
                    <small>Wants</small>
                    <ArtifactLabel artifact={state.myListing.requestedArtifact} />
                  </div>
                </div>
                <button type="button" className="market-button danger" onClick={() => openConfirmation({ type: 'cancel', listing: state.myListing! })} disabled={Boolean(busy)}>
                  <Trash2 size={15} />Remove and Return Artifact
                </button>
              </article>
            ) : !state.marketplaceEnabled ? (
              <div className="market-empty">
                <Package size={28} />
                <strong>New listings are paused</strong>
              </div>
            ) : (
              <div className="market-form">
                <label>
                  <span>Artifact to offer</span>
                  <select
                    value={offeredArtifactId}
                    onChange={(event) => {
                      const nextArtifactId = event.target.value;
                      setOfferedArtifactId(nextArtifactId);
                      if (requestedArtifactId === nextArtifactId) {
                        setRequestedArtifactId('');
                      }
                    }}
                  >
                    <option value="">Select from inventory</option>
                    {state.inventory.map((row) => (
                      <option key={row.artifact.id} value={row.artifact.id}>
                        {row.artifact.name} · {row.artifact.set.rarity} · x{row.availableQuantity}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Artifact wanted</span>
                  <select value={requestedArtifactId} onChange={(event) => setRequestedArtifactId(event.target.value)}>
                    <option value="">Select any artifact</option>
                    {state.artifacts
                      .filter((artifact) => artifact.id !== offeredArtifactId)
                      .map((artifact) => (
                        <option key={artifact.id} value={artifact.id}>
                          {artifact.name} · {artifact.set.rarity}
                        </option>
                      ))}
                  </select>
                </label>

                {offeredArtifactId && requestedArtifactId && (
                  <div className="market-preview">
                    <ArtifactLabel
                      compact
                      artifact={state.inventory.find(
                        (row) => row.artifact.id === offeredArtifactId,
                      )!.artifact}
                    />
                    <ArrowRight size={18} />
                    <ArtifactLabel
                      compact
                      artifact={state.artifacts.find(
                        (artifact) => artifact.id === requestedArtifactId,
                      )!}
                    />
                  </div>
                )}

                <p className="market-listing-fee">
                  Your {state.gemCost} Gem{state.gemCost === 1 ? '' : 's'} will be charged only if the trade completes.
                </p>
                <button
                  type="button"
                  className="market-button primary"
                  onClick={createListing}
                  disabled={
                    !offeredArtifactId
                    || !requestedArtifactId
                    || state.guildGems < state.gemCost
                    || Boolean(busy)
                  }
                >
                  <Plus size={16} />
                  {state.guildGems < state.gemCost
                    ? `Need ${state.gemCost} Gem${state.gemCost === 1 ? '' : 's'} to List`
                    : `List for ${state.durationHours} Hours`}
                </button>
              </div>
            )}
          </section>
        )}

        {tab === 'history' && (
          <section className="market-section">
            <div className="market-section-heading">
              <div>
                <span>Recent Activity</span>
                <h2>Trade History</h2>
              </div>
              <small>{state.history.length} records</small>
            </div>
            {state.history.length > 0 ? (
              <div className="market-history">
                {state.history.map((listing) => (
                  <article key={listing.id}>
                    <span className={`market-status ${listing.status.toLowerCase()}`}>{listing.status}</span>
                    <ArtifactLabel compact artifact={listing.offeredArtifact} />
                    <ArrowRight size={16} />
                    <ArtifactLabel compact artifact={listing.requestedArtifact} />
                  </article>
                ))}
              </div>
            ) : (
              <div className="market-empty">
                <Clock3 size={28} />
                <strong>No trade history yet</strong>
              </div>
            )}
          </section>
        )}
      </div>
      {pendingAction && (
        <div
          className="market-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeConfirmation();
          }}
        >
          <div
            ref={dialogRef}
            className="market-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="market-dialog-title"
            aria-describedby="market-dialog-description"
            onKeyDown={keepDialogFocus}
          >
            <button
              type="button"
              className="market-dialog-close"
              aria-label="Close confirmation"
              onClick={closeConfirmation}
              disabled={Boolean(busy)}
            >
              <X size={18} />
            </button>
            <span className="market-dialog-icon">
              {pendingAction.type === 'accept'
                ? <ArrowRightLeft size={22} />
                : <Trash2 size={22} />}
            </span>
            <h2 id="market-dialog-title">
              {pendingAction.type === 'accept' ? 'Confirm Trade' : 'Remove Listing'}
            </h2>
            <p id="market-dialog-description">
              {pendingAction.type === 'accept'
                ? `Swap your ${pendingAction.listing.requestedArtifact.name} for ${pendingAction.listing.offeredArtifact.name}. You and ${pendingAction.listing.seller.name} will each pay ${pendingAction.listing.gemCost} Guild Gem${pendingAction.listing.gemCost === 1 ? '' : 's'}.`
                : `${pendingAction.listing.offeredArtifact.name} will be removed from the market and returned to your inventory. No Gems will be charged.`}
            </p>
            <div className="market-dialog-actions">
              <button
                type="button"
                className="market-button"
                onClick={closeConfirmation}
                disabled={Boolean(busy)}
              >
                {pendingAction.type === 'accept' ? 'Not Now' : 'Keep Listing'}
              </button>
              <button
                type="button"
                data-confirm
                className={`market-button ${pendingAction.type === 'accept' ? 'primary' : 'danger'}`}
                onClick={confirmMarketplaceAction}
                disabled={Boolean(busy)}
              >
                {busy
                  ? 'Working...'
                  : pendingAction.type === 'accept'
                    ? 'Confirm Trade'
                    : 'Remove Listing'}
              </button>
            </div>
          </div>
        </div>
      )}
      <MarketplaceStyles />
    </main>
  );
}

function MarketplaceStyles() {
  return (
    <style>{`
      .market-page { min-height: 100vh; padding: 20px 12px 52px; background: #080c14; color: #eef2f8; }
      .market-shell { width: min(980px, 100%); margin: 0 auto; display: grid; gap: 14px; }
      .market-header { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #273043; padding-bottom: 12px; }
      .market-header h1 { margin: 7px 0 0; font-family: var(--font-orbitron); font-size: 1.35rem; letter-spacing: 0; }
      .market-header-actions { display: flex; gap: 8px; align-items: center; }
      .market-back { justify-self: start; color: #aeb9ca; text-decoration: none; }
      .market-gems { display: inline-flex; align-items: center; gap: 6px; color: #aeb9ca; font-size: 0.82rem; font-weight: 800; }
      .market-gems { min-height: 42px; padding: 0 12px; color: #d8c4ff; border: 1px solid #3b3152; border-radius: 6px; }
      .market-icon-button { width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid #303a4c; border-radius: 6px; background: #101722; color: #c9d2df; }
      .market-icon-button:disabled { opacity: 0.5; }
      .market-alert { min-height: 44px; display: flex; align-items: center; padding: 10px 12px; border: 1px solid; border-radius: 6px; font-size: 0.86rem; font-weight: 700; }
      .market-alert.error { color: #ffb9b9; border-color: #63383e; background: #211217; }
      .market-alert.success { color: #b8f0cc; border-color: #315d42; background: #102018; }
      .market-alert.paused { color: #f1d992; border-color: #5f5331; background: #211d10; }
      .market-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid #293244; border-radius: 6px; overflow: hidden; background: #0d131d; }
      .market-tabs button { min-height: 46px; display: flex; align-items: center; justify-content: center; gap: 7px; border: 0; border-right: 1px solid #293244; background: transparent; color: #9eaabd; font-weight: 800; }
      .market-tabs button:last-child { border-right: 0; }
      .market-tabs button.active { color: #f2f5fa; background: #182131; }
      .market-fee-note, .market-listing-fee { margin: 0; color: #939fb1; font-size: 0.76rem; line-height: 1.45; }
      .market-fee-note { padding: 0 2px; }
      .market-listing-fee { padding: 2px 0; }
      .market-section { display: grid; gap: 12px; }
      .market-section-heading { min-height: 46px; display: flex; align-items: end; justify-content: space-between; gap: 12px; }
      .market-section-heading span { display: block; color: #7f8ca1; font-size: 0.7rem; font-weight: 900; text-transform: uppercase; }
      .market-section-heading h2 { margin: 3px 0 0; font-size: 1.05rem; letter-spacing: 0; }
      .market-section-heading small { color: #8996aa; white-space: nowrap; }
      .market-filters { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
      .market-filters::-webkit-scrollbar { display: none; }
      .market-filters button { min-height: 38px; flex: 0 0 auto; padding: 0 12px; border: 1px solid #2c3547; border-radius: 6px; background: #0e151f; color: #9faabc; font-size: 0.72rem; font-weight: 900; }
      .market-filters button.active { color: #e9edf4; border-color: #58667c; background: #182131; }
      .market-listings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .market-listing { display: grid; gap: 11px; min-width: 0; padding: 13px; border: 1px solid #293345; border-radius: 6px; background: #0e151f; }
      .market-listing-meta { display: flex; justify-content: space-between; gap: 10px; color: #aeb8c7; font-size: 0.78rem; }
      .market-listing-meta span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800; }
      .market-listing-meta small { display: inline-flex; align-items: center; gap: 4px; color: #8794a7; white-space: nowrap; }
      .market-swap { display: grid; grid-template-columns: minmax(0, 1fr) 22px minmax(0, 1fr); gap: 6px; align-items: center; }
      .market-swap > div { min-width: 0; }
      .market-swap > div > small { display: block; margin-bottom: 6px; color: #78859a; font-size: 0.66rem; font-weight: 900; text-transform: uppercase; }
      .market-swap-arrow { color: #617086; }
      .market-artifact { min-width: 0; display: flex; align-items: center; gap: 8px; }
      .market-artifact > span:last-child { min-width: 0; }
      .market-artifact-icon { width: 38px; height: 38px; flex: 0 0 38px; display: grid; place-items: center; border: 1px solid; border-radius: 6px; background: #121a26; }
      .market-artifact strong, .market-artifact small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .market-artifact strong { color: #edf1f7; font-size: 0.78rem; }
      .market-artifact small { margin-top: 3px; color: #8e9aab; font-size: 0.64rem; }
      .market-artifact small b { font-weight: 900; }
      .market-artifact.compact .market-artifact-icon { width: 32px; height: 32px; flex-basis: 32px; }
      .market-button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 13px; border: 1px solid; border-radius: 6px; font-weight: 900; }
      .market-button:not(.primary):not(.danger) { color: #c5cedb; border-color: #354055; background: #111925; }
      .market-button.primary { color: #06131a; border-color: #70c8dc; background: #8edcf0; }
      .market-button.danger { color: #ffb6b6; border-color: #55343a; background: #211419; }
      .market-button:disabled { opacity: 0.48; }
      .market-form { display: grid; gap: 13px; max-width: 620px; padding: 14px; border: 1px solid #293345; border-radius: 6px; background: #0e151f; }
      .market-form label { display: grid; gap: 6px; }
      .market-form label > span { color: #aab4c3; font-size: 0.76rem; font-weight: 900; }
      .market-form select { width: 100%; min-height: 46px; padding: 0 10px; border: 1px solid #344055; border-radius: 6px; background: #0a1019; color: #edf1f7; font-size: 0.85rem; }
      .market-preview { display: grid; grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr); align-items: center; gap: 8px; padding: 10px; border: 1px solid #263044; border-radius: 6px; background: #0a1019; }
      .market-history { display: grid; gap: 7px; }
      .market-history article { min-width: 0; display: grid; grid-template-columns: 88px minmax(0, 1fr) 18px minmax(0, 1fr); align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #253044; }
      .market-status { width: fit-content; padding: 4px 7px; border-radius: 4px; background: #1b2432; color: #aeb8c7; font-size: 0.64rem; font-weight: 900; }
      .market-status.completed { color: #aee8c4; background: #14261b; }
      .market-status.expired, .market-status.cancelled { color: #a5afbd; background: #1a2029; }
      .market-empty { min-height: 150px; display: grid; place-content: center; justify-items: center; gap: 8px; color: #77859a; border: 1px dashed #2a3548; border-radius: 6px; }
      .market-empty strong { color: #aeb8c7; }
      .market-dialog-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: rgba(2, 5, 10, 0.78); }
      .market-dialog { position: relative; width: min(430px, 100%); display: grid; justify-items: start; gap: 11px; padding: 20px; border: 1px solid #364156; border-radius: 8px; background: #0d141f; box-shadow: 0 18px 45px rgba(0, 0, 0, 0.38); }
      .market-dialog h2 { margin: 0; font-size: 1.05rem; letter-spacing: 0; }
      .market-dialog p { margin: 0; color: #aab4c3; font-size: 0.84rem; line-height: 1.55; }
      .market-dialog-icon { width: 42px; height: 42px; display: grid; place-items: center; color: #9de7f6; border: 1px solid #35475a; border-radius: 6px; background: #111d29; }
      .market-dialog-close { position: absolute; top: 10px; right: 10px; width: 38px; height: 38px; display: grid; place-items: center; border: 0; background: transparent; color: #929eb0; }
      .market-dialog-actions { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 3px; }
      @media (max-width: 680px) {
        .market-page { padding: 12px 9px 38px; }
        .market-listings { grid-template-columns: 1fr; }
        .market-history article { grid-template-columns: 74px minmax(0, 1fr); }
        .market-history article > .market-status { grid-row: 1 / span 2; }
        .market-history article > .market-artifact { grid-column: 2; }
        .market-history article > svg { display: none; }
        .market-dialog { padding: 18px 14px 14px; }
      }
      @media (max-width: 390px) {
        .market-tabs button { font-size: 0.72rem; }
        .market-swap { grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr); }
        .market-artifact-icon { width: 34px; height: 34px; flex-basis: 34px; }
      }
    `}</style>
  );
}
