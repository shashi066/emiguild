'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Award, CheckCircle2, Clock, Coffee, Crown, Info, Lock, LogIn, Phone, RefreshCw, ShoppingBag, Sparkles, TicketCheck, Tv, X } from 'lucide-react';
import { EmicoinAmount, EMIC_FULL_NAME } from '@/components/watch-party/EmicoinAmount';
import InfoGuideModal from '@/components/InfoGuideModal';
import { readApiResponse } from '@/lib/read-api-response';
import { emicRewardCategoryLabel, fanPickStatusLabel } from '@/lib/watch-party-presentation';

const WATCH_PARTY_GUIDE_STEPS = [
  {
    title: 'Sign in and get invited',
    description: 'Watch parties are invite-only. Sign in and contact EmiGuild if you need an invite.',
  },
  {
    title: 'Check in at the counter',
    description: 'Visit the counter before the event. Staff check-in confirms your entry and adds the displayed Watch Party Reward to your EMIC balance.',
  },
  {
    title: 'Enter the watch party',
    description: 'After check-in, tap Enter to open the event page and its optional Fan Pick activity.',
  },
  {
    title: 'Understand EMIC Rewards',
    description: 'EMIC is an in-app EmiGuild reward currency. It has no cash value and cannot be withdrawn or exchanged for cash.',
  },
  {
    title: 'Redeem EMIC Rewards',
    description: 'Use EMIC for Gaming Passes or Food & Drink Rewards. Open My Tickets and show a ready collection ticket to staff.',
  },
] as const;

type WatchPartyState = {
  walletCoins: number | null;
  parties: WatchPartySummary[];
  shop: WatchPartyShop;
};

type WatchPartyShop = {
  walletCoins: number | null;
  items: WatchPartyShopItem[];
  orders: WatchPartyShopOrder[];
};

type WatchPartyShopItem = {
  itemKey: string;
  itemType: string;
  label: string;
  category: string;
  detail: string;
  tokenCost: number;
  accent: string;
};

type WatchPartyShopOrder = {
  id: string;
  itemKey: string;
  itemType: string;
  label: string;
  category: string;
  tokenCost: number;
  status: string;
  requestedAt: string | null;
  givenAt: string | null;
  cancelledAt: string | null;
};

type WatchPartySummary = {
  id: string;
  title: string;
  description: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  venue: string | null;
  entryFeeRupees: number;
  entryCoins: number;
  predictionStatus: string;
  invite: {
    invited: boolean;
    checkedIn: boolean;
    entered: boolean;
    canEnter: boolean;
    canPredict: boolean;
  };
  prediction: { status: string; optionLabel: string; stakeCoins: number } | null;
  inviteCount: number;
  predictionCount: number;
};

type ShopOrderOverlay = {
  status: 'loading' | 'success';
  label: string;
  tokenCost?: number;
};

function formatEventStart(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

function partyStatus(party: WatchPartySummary, signedIn: boolean) {
  if (!signedIn) return { label: 'Login', tone: 'muted' };
  if (!party.invite.invited) return { label: 'Invite Only', tone: 'muted' };
  if (!party.invite.checkedIn) return { label: 'Invited', tone: 'warn' };
  if (!party.invite.entered) return { label: 'Ready', tone: 'cyan' };
  return {
    label: party.prediction ? fanPickStatusLabel(party.prediction.status) : 'Entered',
    tone: 'success',
  };
}

export function WatchPartyClient({
  initialState,
  signedIn,
}: {
  initialState: WatchPartyState;
  signedIn: boolean;
}) {
  const [state, setState] = useState(initialState);
  const [enteringParty, setEnteringParty] = useState<WatchPartySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [shopBusy, setShopBusy] = useState('');
  const [shopOpen, setShopOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [shopTab, setShopTab] = useState<'passes' | 'drinks' | 'tickets'>('passes');
  const [shopOrderOverlay, setShopOrderOverlay] = useState<ShopOrderOverlay | null>(null);
  const [error, setError] = useState('');

  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/watch-parties', { cache: 'no-store' });
      const data = await readApiResponse<WatchPartyState & { error?: string }>(res, 'Refresh failed.');
      if (!res.ok) throw new Error(data.error || 'Refresh failed.');
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      setBusy(false);
    }
  };

  const enterParty = async () => {
    if (!enteringParty) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/watch-parties/${enteringParty.id}/enter`, { method: 'POST' });
      const data = await readApiResponse<{ error?: string }>(res, 'Entry failed.');
      if (!res.ok) throw new Error(data.error || 'Entry failed.');
      window.location.href = `/watch-party/${enteringParty.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Entry failed.');
      setBusy(false);
    }
  };

  const buyShopOrder = async (itemKey: string) => {
    const selectedItem = state.shop.items.find((item) => item.itemKey === itemKey);
    setShopBusy(itemKey);
    setError('');
    setShopOrderOverlay({
      status: 'loading',
      label: selectedItem?.label ?? 'Collection Ticket',
      tokenCost: selectedItem?.tokenCost,
    });
    try {
      const res = await fetch('/api/watch-parties/shop/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemKey }),
      });
      const data = await readApiResponse<WatchPartyShop & { error?: string }>(res, 'Could not redeem this EMIC reward.');
      if (!res.ok) throw new Error(data.error || 'Could not redeem this EMIC reward.');
      setState((current) => ({
        ...current,
        walletCoins: data.walletCoins,
        shop: data,
      }));
      const latestOrder = data.orders[0];
      setShopOrderOverlay({
        status: 'success',
        label: latestOrder?.label ?? selectedItem?.label ?? 'Collection Ticket',
        tokenCost: latestOrder?.tokenCost ?? selectedItem?.tokenCost,
      });
    } catch (err) {
      setShopOrderOverlay(null);
      setError(err instanceof Error ? err.message : 'Order failed.');
    } finally {
      setShopBusy('');
    }
  };

  const walletCoins = state.shop?.walletCoins ?? state.walletCoins;
  const pendingOrderCount = state.shop.orders.filter((order) => order.status === 'PENDING').length;
  const visibleShopItems = state.shop.items.filter((item) => (
    shopTab === 'drinks' ? item.itemType === 'DRINK' : item.itemType !== 'DRINK'
  ));

  return (
    <>
      <section className="watch-party-shell">
        <div className="watch-party-top">
          <div>
            <div className="watch-kicker">Live Events</div>
            <h1 className="font-orbitron">EmiGuild Watch Parties</h1>
          </div>
          <div className="watch-header-actions">
            <button
              className="watch-icon-btn watch-guide-btn"
              type="button"
              onClick={() => setGuideOpen(true)}
              aria-label="Open How Watch Parties Work guide"
              aria-haspopup="dialog"
              title="How Watch Parties Work"
            >
              <Info size={18} aria-hidden="true" />
              <span>Info</span>
            </button>
            <button className="watch-icon-btn" type="button" onClick={refresh} disabled={busy} aria-label="Refresh">
              <RefreshCw size={18} className={busy ? 'watch-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="watch-wallet">
          <span>EMIC Balance</span>
          <strong><EmicoinAmount value={walletCoins} /></strong>
        </div>

        {error && <div className="watch-alert" role="alert">{error}</div>}

        <div className="watch-list">
          {state.parties.length === 0 ? (
            <div className="watch-empty">
              <Tv size={30} />
              <strong>No watch parties live</strong>
              <span>Check back when the next event opens.</span>
            </div>
          ) : state.parties.map((party) => {
            const status = partyStatus(party, signedIn);
            return (
              <article className="watch-card" key={party.id}>
                <div className="watch-card-head">
                  <span className={`watch-chip ${status.tone}`}>
                    {signedIn && !party.invite.invited && <Lock size={12} aria-hidden="true" />}
                    {status.label}
                  </span>
                  <span className="watch-meta"><Clock size={13} />{formatEventStart(party.kickoffAt)}</span>
                </div>
                <h2>{party.homeTeam}</h2>
                <div className="watch-vs">vs</div>
                <h2>{party.awayTeam}</h2>
                {party.venue && <p className="watch-venue">{party.venue}</p>}
                <div className="watch-card-foot">
                  <span>Watch Party Reward</span>
                  <strong><EmicoinAmount value={party.entryCoins} /></strong>
                </div>
                {signedIn && !party.invite.invited && (
                  <a
                    className="watch-invite-note"
                    href="tel:+919989562474"
                    aria-label="Call EmiGuild to request a watch party invite"
                  >
                    <Phone size={14} />
                    Contact EmiGuild for invite
                  </a>
                )}
                {(!signedIn || party.invite.invited) && (
                  <div className="watch-actions-row">
                    {signedIn && party.invite.invited && (
                      <Link className="btn btn-ghost btn-sm" href={`/watch-party/${party.id}`}>
                        <Sparkles size={15} />
                        Open Event
                      </Link>
                    )}
                    {!signedIn ? (
                      <Link className="btn btn-primary btn-sm" href="/login">
                        <LogIn size={15} />
                        Login
                      </Link>
                    ) : party.invite.canEnter && !party.invite.entered ? (
                      <button className="btn btn-primary btn-sm" type="button" onClick={() => setEnteringParty(party)}>
                        <TicketCheck size={15} />
                        Enter
                      </button>
                    ) : party.invite.invited && !party.invite.checkedIn ? (
                      <button className="btn btn-ghost btn-sm" type="button" disabled>
                        <Lock size={15} />
                        Check-in
                      </button>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="watch-shop">
        <div className="watch-rewards-strip">
          <div>
            <div className="watch-kicker">EMIC Rewards</div>
            <h2 className="font-orbitron">EMIC Rewards</h2>
            <p>{pendingOrderCount} collection ticket{pendingOrderCount === 1 ? '' : 's'} ready</p>
          </div>
          <div className="watch-rewards-actions">
            <div className="watch-shop-wallet"><EmicoinAmount value={walletCoins} /></div>
            <button className="btn btn-primary btn-sm" type="button" onClick={() => setShopOpen(true)}>
              <ShoppingBag size={15} />
              Open EMIC Rewards
            </button>
          </div>
        </div>
      </section>

      {shopOpen && (
        <div className="watch-shop-backdrop" role="dialog" aria-modal="true" onClick={() => setShopOpen(false)}>
          <div className="watch-shop-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="watch-shop-sheet-head">
              <div>
                <div className="watch-kicker">EMIC Rewards</div>
                <h2 className="font-orbitron">EMIC Rewards</h2>
              </div>
              <button className="watch-modal-close" type="button" onClick={() => setShopOpen(false)} aria-label="Close EMIC Rewards">
                <X size={18} />
              </button>
            </div>

            <div className="watch-shop-tabs" role="tablist" aria-label="EMIC Reward sections">
              <button type="button" className={shopTab === 'passes' ? 'active' : ''} onClick={() => setShopTab('passes')}>Gaming Passes</button>
              <button type="button" className={shopTab === 'drinks' ? 'active' : ''} onClick={() => setShopTab('drinks')}>Food &amp; Drink Rewards</button>
              <button type="button" className={shopTab === 'tickets' ? 'active' : ''} onClick={() => setShopTab('tickets')}>My Tickets</button>
            </div>

            <div className="watch-shop-body">
              {shopTab === 'tickets' ? (
                !signedIn ? (
                  <p className="watch-shop-empty">Login to see your collection tickets.</p>
                ) : state.shop.orders.length === 0 ? (
                  <p className="watch-shop-empty">No collection tickets yet.</p>
                ) : (
                  <div className="watch-ticket-grid">
                    {state.shop.orders.map((order) => (
                      <article className="watch-pass-ticket" key={order.id}>
                        <div>
                          <div className="watch-pass-ticket-top">
                            <span><TicketCheck size={14} /> {order.status === 'PENDING' ? 'Ready for Collection' : 'Collected'}</span>
                            {order.status === 'GIVEN' && <CheckCircle2 size={15} />}
                          </div>
                          <h3>{order.label}</h3>
                          <p className="watch-ticket-price">
                            <span>{emicRewardCategoryLabel(order.itemType, order.category)}</span>
                            <EmicoinAmount value={order.tokenCost} />
                          </p>
                        </div>
                        <div className="watch-pass-ticket-foot">
                          <span>{order.status === 'PENDING' ? 'Show at Counter' : 'Collected'}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )
              ) : (
                <div className="watch-shop-grid">
                  {visibleShopItems.map((item) => {
                    const canBuy = signedIn && walletCoins != null && walletCoins >= item.tokenCost;
                    const Icon = item.itemType === 'DRINK' ? Coffee : item.itemType === 'GUILD_MEMBERSHIP' ? Crown : Award;
                    return (
                      <article className={`watch-shop-card ${item.accent}`} key={item.itemKey}>
                        <div className="watch-shop-main">
                          <span className="watch-pass-mark"><Icon size={14} /></span>
                          <div>
                            <h3>{item.label}</h3>
                            <p>{item.detail} · {emicRewardCategoryLabel(item.itemType, item.category)}</p>
                          </div>
                        </div>
                        <div className="watch-shop-action">
                          <strong><EmicoinAmount value={item.tokenCost} /></strong>
                          {!signedIn ? (
                            <Link className="btn btn-primary btn-sm" href="/login">
                              <LogIn size={14} />
                              Login
                            </Link>
                          ) : (
                            <button
                              className="btn btn-primary btn-sm"
                              type="button"
                              onClick={() => buyShopOrder(item.itemKey)}
                              disabled={!canBuy || Boolean(shopBusy)}
                            >
                              <ShoppingBag size={14} />
                              {shopBusy === item.itemKey ? 'Redeeming...' : canBuy ? 'Redeem' : 'Balance Low'}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {shopOrderOverlay && (
        <div
          className="watch-order-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={shopOrderOverlay.status === 'loading' ? 'Creating collection ticket' : 'Collection ticket ready'}
          onClick={() => {
            if (shopOrderOverlay.status === 'success') setShopOrderOverlay(null);
          }}
        >
          <section className="watch-order-card" onClick={(event) => event.stopPropagation()}>
            {shopOrderOverlay.status === 'loading' ? (
              <>
                <span className="watch-order-spinner"><Sparkles size={24} /></span>
                <div>
                  <h2 className="font-orbitron">Creating Collection Ticket</h2>
                  <p>{shopOrderOverlay.label}</p>
                </div>
                <strong>
                  {shopOrderOverlay.tokenCost != null
                    ? <EmicoinAmount value={shopOrderOverlay.tokenCost} />
                    : EMIC_FULL_NAME}
                </strong>
              </>
            ) : (
              <>
                <span className="watch-order-check"><TicketCheck size={24} /></span>
                <div>
                  <h2 className="font-orbitron">Collection Ticket Ready</h2>
                  <p>{shopOrderOverlay.label}</p>
                </div>
                <div className="watch-order-actions">
                  <span>View your collection tickets</span>
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    onClick={() => {
                      setShopTab('tickets');
                      setShopOrderOverlay(null);
                    }}
                  >
                    View Ticket
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {enteringParty && (
        <div className="watch-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setEnteringParty(null)}>
          <div className="watch-modal" onClick={(event) => event.stopPropagation()}>
            <button className="watch-modal-close" type="button" onClick={() => setEnteringParty(null)} aria-label="Close">
              <X size={18} />
            </button>
            <TicketCheck size={34} color="#22D3EE" />
            <h2>Watch Party Reward Added</h2>
            <p>{enteringParty.homeTeam} vs {enteringParty.awayTeam}</p>
            <strong><EmicoinAmount value={enteringParty.entryCoins} /></strong>
            <p>Entering opens this event and its optional Fan Pick activity.</p>
            {error && <div className="watch-alert">{error}</div>}
            <button className="btn btn-primary" type="button" onClick={enterParty} disabled={busy}>
              {busy ? 'Entering...' : 'Enter Watch Party'}
            </button>
          </div>
        </div>
      )}

      {guideOpen && (
        <InfoGuideModal
          eyebrow="Watch Party Guide"
          title="How Watch Parties Work"
          subtitle="Invite. Check in. Enter. Enjoy."
          titleId="watch-party-guide-title"
          steps={WATCH_PARTY_GUIDE_STEPS}
          onClose={() => setGuideOpen(false)}
        />
      )}

      <style jsx>{`
        .watch-party-shell, .watch-shop { max-width: 780px; margin: 0 auto; }
        .watch-party-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
        .watch-party-top > div:first-child { min-width: 0; }
        .watch-party-top h1 { margin: 2px 0 0; font-size: 1.75rem; }
        .watch-header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
        .watch-shop { margin-top: 14px; }
        .watch-rewards-strip, .watch-rewards-actions, .watch-shop-sheet-head, .watch-shop-card, .watch-shop-main, .watch-shop-action, .watch-pass-ticket, .watch-pass-ticket-top, .watch-pass-ticket-foot { display: flex; align-items: center; gap: 10px; }
        .watch-rewards-strip, .watch-shop-sheet-head, .watch-pass-ticket-top { justify-content: space-between; }
        .watch-rewards-strip { min-height: 70px; padding: 12px; border: 1px solid rgba(34,211,238,0.22); border-radius: 8px; background: rgba(5,12,24,0.82); }
        .watch-rewards-strip h2, .watch-shop-sheet h2 { margin: 2px 0 0; font-size: 1.05rem; }
        .watch-rewards-strip p { margin: 2px 0 0; color: var(--color-text-muted); font-size: 0.76rem; }
        .watch-rewards-actions { min-width: 0; flex: 0 0 auto; justify-content: flex-end; }
        .watch-shop-wallet { min-height: 36px; min-width: 0; display: grid; place-items: center; color: #22d3ee; }
        .watch-shop-backdrop { position: fixed; inset: 0; z-index: 1100; display: flex; align-items: flex-end; justify-content: center; padding: 12px; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; background: rgba(0,0,0,0.72); }
        .watch-shop-sheet { position: relative; width: min(100%, 540px); height: min(82vh, 720px); height: min(82dvh, 720px); max-height: calc(100vh - 24px); max-height: calc(100dvh - 24px); display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 10px; margin: auto auto 0; padding: 14px; border: 1px solid rgba(148,163,184,0.22); border-radius: 12px 12px 8px 8px; background: #070a12; box-shadow: 0 -18px 40px rgba(0,0,0,0.42); overflow: hidden; }
        .watch-shop-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; padding: 3px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(255,255,255,0.04); }
        .watch-shop-tabs button { min-height: 48px; min-width: 0; padding: 6px 8px; border: 0; border-radius: 6px; color: var(--color-text-muted); background: transparent; font-size: 0.74rem; font-weight: 900; line-height: 1.2; overflow-wrap: anywhere; }
        .watch-shop-tabs button.active { color: #071016; background: #d8dee9; }
        .watch-shop-body { min-height: 0; overflow: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding-right: 2px; }
        .watch-shop-grid, .watch-ticket-grid { display: grid; align-content: start; gap: 8px; min-height: 100%; }
        .watch-order-overlay { position: fixed; inset: 0; z-index: 1250; display: grid; place-items: center; padding: 18px; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; background: rgba(0,0,0,0.62); }
        .watch-order-card { width: min(100%, 330px); min-height: 230px; max-height: calc(100vh - 36px); max-height: calc(100dvh - 36px); display: grid; justify-items: center; align-content: center; gap: 14px; margin: auto; padding: 18px; border: 1px solid rgba(34,211,238,0.34); border-radius: 8px; background: #050914; box-shadow: 0 18px 46px rgba(0,0,0,0.46); text-align: center; overflow-y: auto; }
        .watch-order-card h2 { margin: 0; font-size: 1.08rem; }
        .watch-order-card p { margin: 3px 0 0; color: var(--color-text-secondary); font-size: 0.82rem; }
        .watch-order-card strong { color: #22d3ee; font-family: Orbitron, sans-serif; font-size: 1.05rem; }
        .watch-order-spinner, .watch-order-check { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 50%; color: #22d3ee; background: rgba(34,211,238,0.09); }
        .watch-order-spinner { border: 1px solid rgba(34,211,238,0.36); animation: watchSpin 0.85s linear infinite; }
        .watch-order-check { border: 1px solid rgba(0,230,118,0.34); color: #b9ffd0; background: rgba(0,230,118,0.09); }
        .watch-order-actions { width: 100%; display: grid; gap: 8px; }
        .watch-order-actions span { color: #b9ffd0; font-size: 0.78rem; font-weight: 900; text-transform: uppercase; }
        .watch-order-actions .btn { width: 100%; justify-content: center; }
        .watch-shop-card { --item-color: #d8dee9; --item-border: rgba(216,222,233,0.24); --item-bg: rgba(216,222,233,0.045); min-height: 70px; justify-content: space-between; padding: 10px 11px; border: 1px solid var(--item-border); border-left-width: 3px; border-radius: 8px; background: linear-gradient(135deg, var(--item-bg), rgba(5,12,24,0.86)); }
        .watch-shop-card.bronze { --item-color: #d08a47; --item-border: rgba(208,138,71,0.42); --item-bg: rgba(208,138,71,0.09); }
        .watch-shop-card.silver { --item-color: #cbd5e1; --item-border: rgba(203,213,225,0.34); --item-bg: rgba(203,213,225,0.075); }
        .watch-shop-card.gold { --item-color: #facc15; --item-border: rgba(250,204,21,0.38); --item-bg: rgba(250,204,21,0.08); }
        .watch-shop-card.black { --item-color: #e5e7eb; --item-border: rgba(148,163,184,0.34); --item-bg: rgba(31,41,55,0.34); }
        .watch-shop-card.apex { --item-color: #a78bfa; --item-border: rgba(167,139,250,0.4); --item-bg: rgba(88,28,135,0.16); }
        .watch-shop-card.guild-hero { --item-color: #93c5fd; --item-border: rgba(96,165,250,0.34); --item-bg: rgba(37,99,235,0.12); }
        .watch-shop-card.guild-master { --item-color: #f4cf58; --item-border: rgba(244,207,88,0.38); --item-bg: rgba(244,207,88,0.09); }
        .watch-shop-card.drink { --item-color: #6ee7b7; --item-border: rgba(52,211,153,0.34); --item-bg: rgba(52,211,153,0.09); }
        .watch-shop-main { min-width: 0; flex: 1; }
        .watch-pass-mark { width: 34px; height: 34px; display: grid; place-items: center; flex: 0 0 34px; border: 1px solid var(--item-border); border-radius: 8px; color: var(--item-color); background: rgba(255,255,255,0.04); }
        .watch-shop-main div { min-width: 0; }
        .watch-shop-action { min-width: 210px; min-height: 48px; flex: 0 0 auto; justify-content: flex-end; flex-wrap: wrap; }
        .watch-shop-action strong { min-width: 0; max-width: 100%; display: flex; align-items: center; color: #d8fbff; }
        .watch-shop-action .btn { min-width: 70px; min-height: 48px; justify-content: center; padding-inline: 9px; }
        .watch-shop-card .watch-shop-action .btn-primary { border-color: transparent; color: #081018; background: var(--item-color); box-shadow: none; }
        .watch-shop-card .watch-shop-action .btn-primary:disabled { color: rgba(255,255,255,0.62); background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.12); }
        .watch-shop-card h3, .watch-pass-ticket h3 { margin: 0; overflow-wrap: anywhere; color: var(--item-color); font-size: 0.92rem; line-height: 1.15; }
        .watch-shop-card p, .watch-pass-ticket p, .watch-muted { margin: 2px 0 0; color: var(--color-text-muted); font-size: 0.76rem; }
        .watch-ticket-price { min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; }
        .watch-ticket-price > span { min-width: 0; overflow-wrap: anywhere; }
        .watch-shop-empty { min-height: 180px; display: grid; place-items: center; margin: 0; padding: 14px; border: 1px dashed rgba(34,211,238,0.2); border-radius: 8px; color: var(--color-text-muted); background: rgba(255,255,255,0.035); font-size: 0.82rem; text-align: center; }
        .watch-pass-ticket { min-height: 88px; justify-content: space-between; padding: 10px 11px; border: 1px solid rgba(34,211,238,0.18); border-left: 3px solid #22d3ee; border-radius: 8px; background: rgba(5,12,24,0.82); }
        .watch-pass-ticket > div:first-child { min-width: 0; }
        .watch-pass-ticket-top { color: #22d3ee; }
        .watch-pass-ticket-top span { display: inline-flex; align-items: center; gap: 5px; color: var(--color-text-muted); font-size: 0.68rem; font-weight: 800; text-transform: uppercase; }
        .watch-pass-ticket-foot { flex: 0 0 auto; justify-content: flex-end; }
        .watch-pass-ticket-foot span { padding: 5px 7px; border-radius: 6px; color: #22d3ee; background: rgba(34,211,238,0.1); font-size: 0.7rem; font-weight: 800; white-space: nowrap; }
        .watch-kicker { color: #22d3ee; font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0; }
        .watch-icon-btn { width: 48px; height: 48px; display: grid; place-items: center; border: 1px solid rgba(34,211,238,0.35); border-radius: 8px; background: rgba(34,211,238,0.09); color: #d8fbff; }
        .watch-guide-btn { width: auto; min-width: 72px; display: inline-flex; padding: 0 12px; gap: 6px; font: inherit; font-size: 0.78rem; font-weight: 900; }
        .watch-icon-btn:focus-visible { outline: 2px solid #61e8ff; outline-offset: 3px; }
        .watch-spin { animation: watchSpin 0.8s linear infinite; }
        .watch-wallet { min-height: 64px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 10px; padding: 10px 14px; margin-bottom: 14px; border: 1px solid rgba(34,211,238,0.3); border-radius: 8px; background: rgba(2,8,16,0.72); }
        .watch-wallet span { color: var(--color-text-muted); font-size: 0.82rem; }
        .watch-wallet strong { min-width: 0; max-width: 100%; color: #22d3ee; }
        .watch-list { display: grid; gap: 12px; }
        .watch-card { min-height: 214px; padding: 14px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: linear-gradient(180deg, rgba(15,23,42,0.94), rgba(3,7,18,0.96)); }
        .watch-card-head, .watch-card-foot, .watch-actions-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .watch-card h2 { margin: 10px 0 0; font-size: 1.1rem; line-height: 1.2; color: var(--color-text-primary); }
        .watch-vs { margin-top: 8px; color: #22d3ee; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; }
        .watch-venue { min-height: 20px; margin: 9px 0 12px; color: var(--color-text-muted); font-size: 0.82rem; }
        .watch-card-foot { min-height: 48px; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); color: var(--color-text-secondary); font-size: 0.84rem; }
        .watch-card-foot strong { min-width: 0; max-width: 100%; color: #22d3ee; }
        .watch-invite-note { min-height: 48px; display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 10px; padding: 8px 10px; border: 1px dashed rgba(251,191,36,0.34); border-radius: 8px; color: #fbbf24; background: rgba(251,191,36,0.07); font-size: 0.78rem; font-weight: 800; text-decoration: none; transition: background var(--transition-fast), border-color var(--transition-fast); }
        .watch-invite-note:hover { border-color: rgba(251,191,36,0.62); background: rgba(251,191,36,0.12); }
        .watch-actions-row { margin-top: 12px; }
        .watch-meta { display: inline-flex; align-items: center; gap: 5px; color: var(--color-text-muted); font-size: 0.72rem; }
        .watch-chip { min-width: 66px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; text-align: center; padding: 5px 8px; border-radius: 999px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; }
        .watch-chip.muted { color: #aeb8c7; background: rgba(148,163,184,0.13); }
        .watch-chip.warn { color: #fbbf24; background: rgba(251,191,36,0.13); }
        .watch-chip.cyan { color: #22d3ee; background: rgba(34,211,238,0.13); }
        .watch-chip.success { color: #00e676; background: rgba(0,230,118,0.12); }
        .watch-empty { min-height: 210px; display: grid; place-items: center; text-align: center; gap: 8px; color: var(--color-text-muted); border: 1px dashed rgba(255,255,255,0.14); border-radius: 8px; }
        .watch-empty strong { color: var(--color-text-primary); }
        .watch-alert { padding: 10px 12px; margin-bottom: 12px; border: 1px solid rgba(255,107,107,0.4); border-radius: 8px; color: #ffb4b4; background: rgba(255,107,107,0.1); font-size: 0.83rem; }
        .watch-modal-backdrop { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center; padding: 18px; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; background: rgba(0,0,0,0.72); }
        .watch-modal { width: min(100%, 360px); max-height: calc(100vh - 36px); max-height: calc(100dvh - 36px); position: relative; display: grid; gap: 12px; margin: auto; padding: 20px; border: 1px solid rgba(34,211,238,0.34); border-radius: 8px; background: #050914; text-align: center; overflow-y: auto; }
        .watch-modal h2 { margin: 0; font-size: 1.2rem; }
        .watch-modal p { margin: 0; color: var(--color-text-secondary); }
        .watch-modal-close { position: absolute; top: 6px; right: 6px; width: 44px; height: 44px; display: grid; place-items: center; color: var(--color-text-muted); background: transparent; border: 0; }
        @keyframes watchSpin { to { transform: rotate(360deg); } }
        @media (min-width: 720px) {
          .watch-party-top h1 { font-size: 2.2rem; }
          .watch-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 560px) {
          .watch-party-top { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 10px; }
          .watch-party-top h1 { font-size: 1.4rem; }
          .watch-header-actions { justify-content: flex-start; }
          .watch-guide-btn { width: auto; min-width: 72px; padding: 0 12px; }
          .watch-shop-backdrop { padding: 8px; }
          .watch-shop-sheet { height: min(84vh, 640px); height: min(84dvh, 640px); max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); padding: 12px; }
          .watch-rewards-strip { align-items: stretch; flex-direction: column; }
          .watch-rewards-actions { justify-content: space-between; flex-wrap: wrap; }
          .watch-shop-card { align-items: stretch; flex-direction: column; gap: 8px; }
          .watch-shop-action { min-width: 0; width: 100%; justify-content: space-between; }
          .watch-shop-action strong { text-align: left; }
        }
        @media (max-width: 420px) {
          .watch-shop-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .watch-shop-tabs button:last-child { grid-column: 1 / -1; }
          .watch-rewards-actions { display: grid; grid-template-columns: minmax(0, 1fr); }
          .watch-shop-wallet, .watch-rewards-actions .btn { width: 100%; min-width: 0; justify-content: center; }
        }
        @media (max-width: 360px) {
          .watch-shop-backdrop { padding: 4px; }
          .watch-shop-sheet { max-height: calc(100vh - 8px); max-height: calc(100dvh - 8px); padding: 10px; }
          .watch-shop-sheet-head { align-items: flex-start; padding-right: 44px; }
          .watch-pass-ticket { align-items: stretch; flex-direction: column; }
          .watch-pass-ticket-foot { justify-content: flex-start; }
          .watch-modal-backdrop { padding: 8px; }
          .watch-modal { max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); padding: 16px 12px; }
          .watch-order-overlay { padding: 8px; }
          .watch-order-card { min-height: 0; max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); padding: 16px 12px; }
        }
      `}</style>
    </>
  );
}
