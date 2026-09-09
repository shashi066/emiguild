'use client';

import Link from 'next/link';
import { Award, CheckCircle2, Coffee, Crown, LogIn, ShoppingBag, TicketCheck } from 'lucide-react';
import { useState } from 'react';
import { EmicoinAmount } from '@/components/watch-party/EmicoinAmount';
import { emicRewardCategoryLabel } from '@/lib/watch-party-presentation';
import { readApiResponse } from '@/lib/read-api-response';

export type EmicRewardsState = {
  walletCoins: number | null;
  items: Array<{ itemKey: string; itemType: string; label: string; category: string; detail: string; tokenCost: number; accent: string }>;
  orders: Array<{ id: string; itemKey: string; itemType: string; label: string; category: string; tokenCost: number; status: string }>;
};

export function EmicRewardsClient({ initialState, signedIn }: { initialState: EmicRewardsState; signedIn: boolean }) {
  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState<'passes' | 'drinks' | 'tickets'>('passes');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const visibleItems = state.items.filter((item) => tab === 'drinks' ? item.itemType === 'DRINK' : item.itemType !== 'DRINK');

  const redeem = async (itemKey: string) => {
    if (busy) return;
    setBusy(itemKey);
    setError('');
    try {
      const response = await fetch('/api/emic-rewards/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemKey }),
      });
      const data = await readApiResponse<EmicRewardsState & { error?: string }>(response, 'Could not create this collection ticket.');
      if (!response.ok) throw new Error(data.error || 'Could not create this collection ticket.');
      setState(data);
      setTab('tickets');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this collection ticket.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="emic-rewards-page">
      <header className="emic-rewards-head">
        <div>
          <span>Spend Your EMIC</span>
          <h1 className="font-orbitron">EMIC Rewards</h1>
        </div>
        <div className="emic-rewards-balance" aria-label="EMIC Balance">
          <small>Balance</small>
          <strong><EmicoinAmount value={state.walletCoins} /></strong>
        </div>
      </header>

      {error && <div className="emic-rewards-alert" role="alert">{error}</div>}

      <div className="emic-rewards-tabs" role="tablist" aria-label="EMIC Reward sections">
        <button type="button" role="tab" aria-selected={tab === 'passes'} className={tab === 'passes' ? 'active' : ''} onClick={() => setTab('passes')}>Gaming Passes</button>
        <button type="button" role="tab" aria-selected={tab === 'drinks'} className={tab === 'drinks' ? 'active' : ''} onClick={() => setTab('drinks')}>Food &amp; Drink</button>
        <button type="button" role="tab" aria-selected={tab === 'tickets'} className={tab === 'tickets' ? 'active' : ''} onClick={() => setTab('tickets')}>My Tickets</button>
      </div>

      {tab === 'tickets' ? (
        <div className="emic-ticket-list">
          {!signedIn ? (
            <div className="emic-rewards-empty"><LogIn size={24} /><p>Sign in to see your collection tickets.</p><Link className="btn btn-primary btn-sm" href="/login">Login</Link></div>
          ) : state.orders.length === 0 ? (
            <div className="emic-rewards-empty"><TicketCheck size={24} /><p>No collection tickets yet.</p></div>
          ) : state.orders.map((order) => (
            <article className="emic-ticket" key={order.id}>
              <div>
                <span className="emic-ticket-state"><TicketCheck size={14} />{order.status === 'PENDING' ? 'Ready for Collection' : 'Collected'}</span>
                <h2>{order.label}</h2>
                <p>{emicRewardCategoryLabel(order.itemType, order.category)}</p>
              </div>
              <div className="emic-ticket-cost"><EmicoinAmount value={order.tokenCost} />{order.status === 'GIVEN' && <CheckCircle2 size={17} />}</div>
            </article>
          ))}
        </div>
      ) : (
        <div className="emic-reward-list">
          {visibleItems.length === 0 ? (
            <div className="emic-rewards-empty"><ShoppingBag size={24} /><p>No rewards are available in this section right now.</p></div>
          ) : visibleItems.map((item) => {
            const Icon = item.itemType === 'DRINK' ? Coffee : item.itemType === 'GUILD_MEMBERSHIP' ? Crown : Award;
            const canBuy = signedIn && state.walletCoins != null && state.walletCoins >= item.tokenCost;
            return (
              <article className={`emic-reward-item ${item.accent}`} key={item.itemKey}>
                <div className="emic-reward-copy">
                  <span className="emic-reward-icon"><Icon size={17} /></span>
                  <div><h2>{item.label}</h2><p>{item.detail} · {emicRewardCategoryLabel(item.itemType, item.category)}</p></div>
                </div>
                <div className="emic-reward-action">
                  <strong><EmicoinAmount value={item.tokenCost} /></strong>
                  {!signedIn ? (
                    <Link className="btn btn-primary btn-sm" href="/login"><LogIn size={14} />Login</Link>
                  ) : (
                    <button className="btn btn-primary btn-sm" type="button" disabled={!canBuy || Boolean(busy)} onClick={() => redeem(item.itemKey)}>
                      {busy === item.itemKey ? <span className="spinner emic-small-spinner" aria-hidden="true" /> : <ShoppingBag size={14} />}
                      {busy === item.itemKey ? 'Creating...' : canBuy ? 'Redeem' : 'Balance Low'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .emic-rewards-page { width: min(100%, 760px); margin: 0 auto; }
        .emic-rewards-head, .emic-reward-item, .emic-ticket, .emic-reward-copy, .emic-reward-action, .emic-ticket-state, .emic-ticket-cost { display: flex; align-items: center; gap: 10px; }
        .emic-rewards-head { justify-content: space-between; margin-bottom: 14px; }
        .emic-rewards-head span, .emic-rewards-balance small { color: #f4cf58; font-size: .7rem; font-weight: 800; text-transform: uppercase; }
        .emic-rewards-head h1 { margin: 3px 0 0; font-size: clamp(1.25rem, 5vw, 1.75rem); }
        .emic-rewards-balance { min-width: 92px; padding-left: 12px; border-left: 1px solid rgba(250,204,21,.28); text-align: right; }
        .emic-rewards-balance strong { display: flex; justify-content: flex-end; margin-top: 3px; color: #f8fafc; }
        .emic-rewards-tabs { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 5px; padding: 4px; border: 1px solid rgba(148,163,184,.2); border-radius: 8px; background: #0b1220; }
        .emic-rewards-tabs button { min-width: 0; min-height: 46px; padding: 6px; border: 0; border-radius: 6px; color: #94a3b8; background: transparent; font-size: .72rem; font-weight: 800; }
        .emic-rewards-tabs button.active { color: #10151d; background: #f4cf58; }
        .emic-reward-list, .emic-ticket-list { display: grid; gap: 8px; margin-top: 10px; }
        .emic-reward-item, .emic-ticket { justify-content: space-between; min-width: 0; padding: 11px; border: 1px solid rgba(148,163,184,.24); border-left: 3px solid var(--item-color,#f4cf58); border-radius: 8px; background: #0b1321; }
        .emic-reward-item.bronze { --item-color:#d08a47; } .emic-reward-item.silver { --item-color:#cbd5e1; } .emic-reward-item.gold { --item-color:#facc15; }
        .emic-reward-item.black { --item-color:#e5e7eb; } .emic-reward-item.apex { --item-color:#a78bfa; } .emic-reward-item.guild-hero { --item-color:#93c5fd; }
        .emic-reward-item.guild-master { --item-color:#f4cf58; } .emic-reward-item.drink { --item-color:#6ee7b7; }
        .emic-reward-copy { min-width: 0; flex: 1; }
        .emic-reward-icon { width: 34px; height: 34px; flex: 0 0 34px; display: grid; place-items: center; border: 1px solid rgba(148,163,184,.3); border-radius: 6px; color: var(--item-color); }
        .emic-reward-item h2, .emic-ticket h2 { margin: 0; color: var(--item-color,#f8fafc); font-size: .92rem; }
        .emic-reward-item p, .emic-ticket p { margin: 3px 0 0; color: #94a3b8; font-size: .75rem; }
        .emic-reward-action { flex: 0 0 auto; justify-content: flex-end; }
        .emic-reward-action strong { color: #d8fbff; }
        .emic-ticket-state { color: #67e8f9; font-size: .7rem; font-weight: 800; }
        .emic-ticket-cost { color: #86efac; font-weight: 800; }
        .emic-rewards-alert { margin: 0 0 10px; padding: 10px; border-left: 3px solid #fb7185; background: #24131b; color: #fecdd3; font-size: .82rem; }
        .emic-rewards-empty { min-height: 180px; display: grid; place-items: center; align-content: center; gap: 8px; padding: 20px; border: 1px dashed rgba(148,163,184,.25); border-radius: 8px; color: #94a3b8; text-align: center; }
        .emic-rewards-empty p { margin: 0; }
        .emic-small-spinner { width: 14px; height: 14px; border-width: 2px; }
        @media (max-width: 520px) {
          .emic-rewards-head { align-items: flex-end; }
          .emic-reward-item { align-items: stretch; flex-direction: column; }
          .emic-reward-action { justify-content: space-between; }
          .emic-reward-action .btn { min-width: 108px; min-height: 44px; justify-content: center; }
          .emic-ticket { align-items: flex-start; }
        }
        @media (max-width: 350px) {
          .emic-rewards-tabs { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .emic-rewards-tabs button:last-child { grid-column: 1/-1; }
        }
      `}</style>
    </section>
  );
}
