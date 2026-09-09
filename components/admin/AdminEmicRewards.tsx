'use client';

import {
  BadgeCheck,
  Coffee,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingBag,
  Ticket,
  Undo2,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EmicoinAmount } from '@/components/watch-party/EmicoinAmount';
import { AdminModalShell } from '@/components/admin/AdminModalShell';
import { emicRewardCategoryLabel } from '@/lib/watch-party-presentation';
import { readApiResponse } from '@/lib/read-api-response';

type CatalogItem = {
  itemKey: string;
  itemType: 'HOUR_PASS' | 'GUILD_MEMBERSHIP' | 'DRINK';
  label: string;
  category: string;
  detail: string;
  tokenCost: number;
  accent: string;
  isActive: boolean;
};
type Order = { id: string; itemType: string; label: string; category: string; tokenCost: number; requestedAt: string | null; userName: string; userEmail: string };
type PageInfo = { hasMore: boolean; nextSkip: number | null };
type AdminTab = 'catalog' | 'redemptions';

function kindOf(item: CatalogItem) {
  return item.itemType === 'DRINK' ? 'FOOD_DRINK' : 'PASS';
}

function ItemEditor({ item, onClose, onSave }: { item: CatalogItem | null; onClose: () => void; onSave: (item: CatalogItem) => Promise<void> }) {
  const [kind, setKind] = useState<'PASS' | 'FOOD_DRINK'>(item ? kindOf(item) : 'PASS');
  const [label, setLabel] = useState(item?.label ?? '');
  const [detail, setDetail] = useState(item?.detail ?? '');
  const [tokenCost, setTokenCost] = useState(item ? String(item.tokenCost) : '');
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const parsedCost = Number(tokenCost);
  const valid = label.trim().length > 0 && detail.trim().length > 0 && Number.isInteger(parsedCost) && parsedCost >= 1 && parsedCost <= 1_000_000;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const changingKind = item && kindOf(item) !== kind;
      await onSave({
        itemKey: item?.itemKey ?? '',
        itemType: kind === 'FOOD_DRINK' ? 'DRINK' : changingKind ? 'HOUR_PASS' : item?.itemType ?? 'HOUR_PASS',
        label: label.trim(),
        category: changingKind || !item ? (kind === 'FOOD_DRINK' ? 'Food & Drink' : 'Passes') : item.category,
        detail: detail.trim(),
        tokenCost: parsedCost,
        accent: changingKind || !item ? (kind === 'FOOD_DRINK' ? 'drink' : 'apex') : item.accent,
        isActive,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this reward.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminModalShell onClose={() => !busy && onClose()} labelledBy="emic-item-title" lightweight>
      <div className="admin-modal-header">
        <div><span className="emic-editor-kicker">Catalog Item</span><h2 id="emic-item-title">{item ? 'Edit Reward' : 'Add Reward'}</h2><p>Choose what appears in the EMIC shop.</p></div>
        <button className="emic-editor-close" type="button" onClick={onClose} disabled={busy} aria-label="Close reward editor"><X size={18} /></button>
      </div>
      <form className="emic-editor" onSubmit={submit}>
        {error && <div className="emic-editor-error" role="alert">{error}</div>}
        <fieldset>
          <legend>Reward type</legend>
          <div className="emic-type-options">
            <button type="button" className={kind === 'PASS' ? 'selected' : ''} aria-pressed={kind === 'PASS'} onClick={() => setKind('PASS')}><Ticket size={19} /><span>Pass</span></button>
            <button type="button" className={kind === 'FOOD_DRINK' ? 'selected' : ''} aria-pressed={kind === 'FOOD_DRINK'} onClick={() => setKind('FOOD_DRINK')}><Coffee size={19} /><span>Food &amp; Drink</span></button>
          </div>
        </fieldset>
        <label>Name<input className="form-input" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} required autoFocus placeholder={kind === 'PASS' ? 'Weekend Gaming Pass' : 'Red Bull'} /></label>
        <label>Description<input className="form-input" value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={100} required placeholder={kind === 'PASS' ? '5 hours' : 'Collect at counter'} /></label>
        <label>EMIC price<input className="form-input" type="number" inputMode="numeric" min="1" max="1000000" step="1" value={tokenCost} onChange={(event) => setTokenCost(event.target.value)} required /></label>
        <label className="emic-visible-toggle"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span>Show this item in the shop</span></label>
        <div className="emic-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={!valid || busy}>{busy ? 'Saving...' : 'Save Reward'}</button>
        </div>
      </form>
      <style jsx>{`
        .emic-editor { display:grid; gap:13px; }
        .emic-editor-kicker { color:#f4cf58; font-size:.66rem; font-weight:900; text-transform:uppercase; }
        .emic-editor-close { width:44px; height:44px; display:grid; flex:0 0 auto; place-items:center; border:1px solid rgba(148,163,184,.22); border-radius:7px; color:#cbd5e1; background:#0b1321; }
        .emic-editor-close:focus-visible { outline:2px solid #67e8f9; outline-offset:2px; }
        .emic-editor label:not(.emic-visible-toggle), .emic-editor fieldset { display:grid; gap:6px; color:#cbd5e1; font-size:.8rem; font-weight:800; }
        .emic-editor fieldset { margin:0; padding:0; border:0; }
        .emic-editor legend { margin-bottom:7px; color:#a100f2; }
        .emic-type-options { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .emic-type-options button { min-height:54px; display:flex; align-items:center; justify-content:center; gap:8px; border:1px solid rgba(148,163,184,.3); border-radius:7px; color:#cbd5e1; background:#0d1726; font-weight:800; }
        .emic-type-options button.selected { border-color:#67e8f9; color:#67e8f9; background:#102331; }
        .emic-visible-toggle { min-height:44px; display:flex; align-items:center; gap:8px; color:#cbd5e1; font-size:.82rem; font-weight:700; }
        .emic-visible-toggle input { width:18px; height:18px; accent-color:#22d3ee; }
        .emic-editor-error { padding:9px; border-left:3px solid #fb7185; background:#24131b; color:#fecdd3; font-size:.8rem; }
        .emic-modal-actions { display:flex; justify-content:flex-end; gap:8px; padding-top:3px; }
        @media(max-width:520px) { :global(.admin-modal-header) { gap:10px; margin-bottom:16px; } .emic-type-options { grid-template-columns:1fr; } .emic-modal-actions .btn { min-width:0; min-height:44px; flex:1; justify-content:center; padding-inline:10px; } }
      `}</style>
    </AdminModalShell>
  );
}

export function AdminEmicRewards() {
  const [tab, setTab] = useState<AdminTab>('catalog');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({ hasMore: false, nextSkip: null });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | 'new' | null>(null);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/emic-rewards/config', { cache: 'no-store' });
      const data = await readApiResponse<{ items?: CatalogItem[]; error?: string }>(response, 'Could not load the catalog.');
      if (!response.ok) throw new Error(data.error || 'Could not load the catalog.');
      setItems(data.items ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the catalog.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async (append = false) => {
    setBusy(append ? 'more' : 'orders');
    setError('');
    try {
      const skip = append ? pageInfo.nextSkip ?? orders.length : 0;
      const response = await fetch(`/api/admin/emic-rewards/orders?skip=${skip}&take=24`, { cache: 'no-store' });
      const data = await readApiResponse<{ orders?: Order[]; pageInfo?: PageInfo; error?: string }>(response, 'Could not load redemptions.');
      if (!response.ok) throw new Error(data.error || 'Could not load redemptions.');
      setOrders((current) => append ? [...current, ...(data.orders ?? [])] : (data.orders ?? []));
      setPageInfo(data.pageInfo ?? { hasMore: false, nextSkip: null });
      setOrdersLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load redemptions.');
    } finally {
      setBusy('');
    }
  }, [orders.length, pageInfo.nextSkip]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => {
    if (tab === 'redemptions' && !ordersLoaded) void loadOrders();
  }, [tab, ordersLoaded, loadOrders]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return items.filter((item) => (showHidden || item.isActive) && (!query || `${item.label} ${item.detail} ${item.category}`.toLocaleLowerCase().includes(query)));
  }, [items, search, showHidden]);

  const saveCatalog = async (nextItems: CatalogItem[]) => {
    const response = await fetch('/api/admin/emic-rewards/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: nextItems }),
    });
    const data = await readApiResponse<{ items?: CatalogItem[]; error?: string }>(response, 'Could not save the catalog.');
    if (!response.ok) throw new Error(data.error || 'Could not save the catalog.');
    setItems(data.items ?? []);
  };

  const saveItem = async (nextItem: CatalogItem) => {
    const nextItems = nextItem.itemKey
      ? items.map((item) => item.itemKey === nextItem.itemKey ? nextItem : item)
      : [...items, nextItem];
    await saveCatalog(nextItems);
    setNotice(`${nextItem.label} saved.`);
  };

  const toggleItem = async (item: CatalogItem) => {
    setBusy(item.itemKey);
    setError('');
    setNotice('');
    try {
      await saveCatalog(items.map((current) => current.itemKey === item.itemKey ? { ...current, isActive: !current.isActive } : current));
      setNotice(`${item.label} ${item.isActive ? 'hidden from' : 'shown in'} the shop.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this reward.');
    } finally {
      setBusy('');
    }
  };

  const updateOrder = async (order: Order, action: 'given' | 'cancel') => {
    setBusy(order.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/emic-rewards/orders/${order.id}/${action}`, { method: 'POST' });
      const data = await readApiResponse<{ error?: string }>(response, 'Could not update redemption.');
      if (!response.ok) throw new Error(data.error || 'Could not update redemption.');
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setNotice(action === 'given' ? `${order.label} marked collected.` : `${order.tokenCost.toLocaleString('en-IN')} EMIC restored to ${order.userName}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update redemption.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="admin-page emic-admin-page">
      <header className="admin-page-header emic-admin-head">
        <div><span className="emic-admin-kicker">Shop &amp; Counter</span><h1>EMIC Rewards</h1><p>Choose shop items and fulfil collection tickets.</p></div>
      </header>

      <div className="emic-admin-tabs" role="tablist" aria-label="EMIC Rewards sections">
        <button type="button" role="tab" aria-selected={tab === 'catalog'} className={tab === 'catalog' ? 'active' : ''} onClick={() => { setTab('catalog'); setError(''); }}><ShoppingBag size={17} />Catalog</button>
        <button type="button" role="tab" aria-selected={tab === 'redemptions'} className={tab === 'redemptions' ? 'active' : ''} onClick={() => { setTab('redemptions'); setError(''); }}><BadgeCheck size={17} />Redemptions{ordersLoaded && orders.length > 0 ? <span>{orders.length}</span> : null}</button>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {tab === 'catalog' ? (
        <section className="emic-admin-panel">
          <div className="emic-catalog-tools">
            <label className="emic-catalog-search"><span className="sr-only">Search reward items</span><input className="form-input" type="search" placeholder="Search rewards" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label className="emic-hidden-toggle"><input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} />Show hidden</label>
            <button className="btn btn-primary btn-sm" type="button" onClick={() => setEditingItem('new')}><Plus size={16} />Add Reward</button>
          </div>
          {catalogLoading ? <div className="emic-admin-empty"><span className="spinner" />Loading catalog...</div> : visibleItems.length === 0 ? <div className="emic-admin-empty">No rewards match this search.</div> : (
            <div className="emic-catalog-list">
              {visibleItems.map((item) => {
                const Icon = item.itemType === 'DRINK' ? Coffee : Ticket;
                return (
                  <article className={`emic-catalog-item${item.isActive ? '' : ' hidden'}`} key={item.itemKey}>
                    <span className="emic-catalog-icon"><Icon size={19} /></span>
                    <div className="emic-catalog-copy"><strong>{item.label}</strong><span>{item.detail} / {emicRewardCategoryLabel(item.itemType, item.category)}</span></div>
                    <div className="emic-catalog-price"><span>Price</span><strong><EmicoinAmount value={item.tokenCost} /></strong></div>
                    <div className="emic-catalog-actions">
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditingItem(item)} disabled={Boolean(busy)}><Pencil size={15} />Edit</button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => toggleItem(item)} disabled={Boolean(busy)}>{item.isActive ? <EyeOff size={15} /> : <Eye size={15} />}{busy === item.itemKey ? 'Saving...' : item.isActive ? 'Hide' : 'Show'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="emic-admin-panel">
          <div className="emic-admin-title"><div><BadgeCheck size={18} /><strong>Pending Redemptions</strong></div><button className="btn btn-ghost btn-sm" type="button" onClick={() => loadOrders()} disabled={Boolean(busy)}><RefreshCw size={15} />Refresh</button></div>
          {busy === 'orders' ? <div className="emic-admin-empty"><span className="spinner" />Loading redemptions...</div> : orders.length === 0 ? <div className="emic-admin-empty">No pending EMIC Reward tickets.</div> : (
            <div className="emic-admin-list">
              {orders.map((order) => (
                <article className="emic-admin-order" key={order.id}>
                  <div className="emic-order-reward"><span>Reward</span><strong>{order.label}</strong><em>{emicRewardCategoryLabel(order.itemType, order.category)} / <EmicoinAmount value={order.tokenCost} /></em></div>
                  <div className="emic-order-user"><span>Player</span><strong>{order.userName}</strong><em>{order.userEmail}</em></div>
                  <time><span>Requested</span>{order.requestedAt ? new Date(order.requestedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'Time unavailable'}</time>
                  <div className="emic-admin-actions">
                    <button className="btn btn-primary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => updateOrder(order, 'given')}><BadgeCheck size={15} />{busy === order.id ? 'Working...' : 'Mark Collected'}</button>
                    <button className="btn btn-ghost btn-sm emic-admin-cancel" type="button" disabled={Boolean(busy)} onClick={() => updateOrder(order, 'cancel')}><Undo2 size={15} />Cancel + Restore</button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {pageInfo.hasMore && <button className="btn btn-ghost emic-admin-more" type="button" onClick={() => loadOrders(true)} disabled={Boolean(busy)}>{busy === 'more' ? 'Loading...' : 'Load More'}</button>}
        </section>
      )}

      {editingItem && <ItemEditor item={editingItem === 'new' ? null : editingItem} onClose={() => setEditingItem(null)} onSave={saveItem} />}

      <style jsx>{`
        .emic-admin-page { width:100%; max-width:1120px; margin:0 auto; }
        .emic-admin-head { margin-bottom:12px; }
        .emic-admin-kicker { color:#f4cf58; font-size:.7rem; font-weight:900; text-transform:uppercase; }
        .emic-admin-head h1 { margin:3px 0; font-size:1.55rem; }
        .emic-admin-head p { margin:0; color:var(--color-text-muted); font-size:.84rem; }
        .emic-admin-tabs { width:min(100%,420px); display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:12px; padding:4px; border:1px solid rgba(148,163,184,.2); border-radius:8px; background:#0b1220; }
        .emic-admin-tabs button { min-width:0; min-height:44px; display:flex; align-items:center; justify-content:center; gap:7px; padding:8px 10px; border:0; border-radius:6px; color:#94a3b8; background:transparent; font-size:.8rem; font-weight:800; }
        .emic-admin-tabs button.active { color:#082f49; background:#67e8f9; }
        .emic-admin-tabs button span { min-width:20px; padding:2px 5px; border-radius:8px; background:#172033; color:#f8fafc; font-size:.68rem; }
        .emic-admin-panel { min-width:0; padding:14px; border:1px solid rgba(148,163,184,.2); border-radius:8px; background:#0b1220; }
        .emic-catalog-tools { display:grid; grid-template-columns:minmax(180px,1fr) auto auto; align-items:center; gap:8px; margin-bottom:12px; }
        .emic-catalog-search { min-width:0; }
        .emic-catalog-search input { width:100%; }
        .emic-hidden-toggle, .emic-visible-toggle { min-height:44px; display:flex; align-items:center; gap:8px; color:#cbd5e1; font-size:.82rem; font-weight:700; }
        .emic-hidden-toggle input, .emic-visible-toggle input { width:18px; height:18px; accent-color:#22d3ee; }
        .emic-catalog-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
        .emic-admin-list { display:grid; gap:7px; }
        .emic-catalog-item { min-width:0; display:grid; grid-template-columns:36px minmax(0,1fr) auto; align-items:center; gap:9px; padding:11px; border:1px solid rgba(103,232,249,.24); border-left:3px solid #67e8f9; border-radius:7px; background:#0d1726; }
        .emic-catalog-item.hidden { opacity:.62; border-left-color:#64748b; }
        .emic-catalog-icon { width:34px; height:34px; display:grid; place-items:center; border:1px solid rgba(103,232,249,.32); border-radius:6px; color:#67e8f9; }
        .emic-catalog-copy { min-width:0; display:grid; gap:3px; }
        .emic-catalog-copy strong { color:#f8fafc; overflow-wrap:anywhere; }
        .emic-catalog-copy span { color:#94a3b8; font-size:.75rem; overflow-wrap:anywhere; }
        .emic-catalog-price { min-width:0; display:grid; justify-items:end; gap:2px; color:#f4cf58; white-space:nowrap; }
        .emic-catalog-price>span { color:#718096; font-size:.62rem; font-weight:700; text-transform:uppercase; }
        .emic-catalog-price strong { color:#f4cf58; }
        .emic-catalog-actions, .emic-admin-title, .emic-admin-title > div, .emic-admin-actions { display:flex; align-items:center; gap:7px; }
        .emic-catalog-actions { grid-column:1/-1; justify-content:flex-end; padding-top:8px; border-top:1px solid rgba(148,163,184,.1); }
        .emic-admin-title { justify-content:space-between; margin-bottom:12px; }
        .emic-admin-order { min-width:0; display:grid; grid-template-columns:minmax(150px,1.2fr) minmax(140px,1fr) minmax(135px,.8fr) auto; align-items:center; gap:10px; padding:11px; border:1px solid rgba(148,163,184,.2); border-left:3px solid #f4cf58; border-radius:7px; background:#0d1726; }
        .emic-admin-order > div:not(.emic-admin-actions), .emic-admin-order time { min-width:0; display:grid; gap:3px; }
        .emic-admin-order span, .emic-admin-order time, .emic-admin-order em { color:var(--color-text-muted); font-size:.72rem; font-style:normal; overflow-wrap:anywhere; }
        .emic-admin-order div>span, .emic-admin-order time>span { color:#718096; font-size:.62rem; font-weight:800; text-transform:uppercase; }
        .emic-admin-order strong { overflow-wrap:anywhere; }
        .emic-admin-actions { justify-content:flex-end; }
        .emic-admin-cancel { color:#fda4af; }
        .emic-admin-empty { min-height:160px; display:flex; align-items:center; justify-content:center; gap:10px; color:var(--color-text-muted); text-align:center; }
        .emic-admin-more { width:100%; margin-top:12px; justify-content:center; }
        @media(max-width:900px) {
          .emic-catalog-list { grid-template-columns:1fr; }
          .emic-admin-order { grid-template-columns:1fr 1fr; }
          .emic-admin-actions { grid-column:1/-1; justify-content:stretch; }
          .emic-admin-actions .btn { min-height:44px; flex:1; justify-content:center; }
        }
        @media(max-width:680px) {
          .emic-catalog-tools { grid-template-columns:1fr auto; }
          .emic-catalog-search { grid-column:1/-1; }
          .emic-catalog-actions .btn { min-height:42px; flex:1; justify-content:center; }
        }
        @media(max-width:520px) {
          .emic-admin-page { min-width:0; }
          .emic-admin-head h1 { font-size:1.3rem; }
          .emic-admin-tabs button { flex:1; padding:6px; font-size:.76rem; }
          .emic-admin-panel { padding:9px; }
          .emic-catalog-tools { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
          .emic-catalog-search { grid-column:1/-1; }
          .emic-hidden-toggle { min-width:0; }
          .emic-catalog-tools .btn { min-height:44px; justify-content:center; }
          .emic-catalog-item { grid-template-columns:34px minmax(0,1fr) auto; gap:8px; padding:10px 9px; }
          .emic-catalog-actions { grid-column:1/-1; }
          .emic-admin-order { grid-template-columns:1fr; }
          .emic-admin-title { align-items:flex-start; }
          .emic-admin-title>div { min-width:0; }
          .emic-admin-actions { grid-column:auto; flex-direction:column; }
          .emic-admin-actions .btn { width:100%; }
        }
        @media(max-width:360px) {
          .emic-admin-panel { margin-inline:-3px; }
          .emic-admin-tabs button { gap:5px; padding-inline:6px; }
          .emic-catalog-item { grid-template-columns:32px minmax(0,1fr); }
          .emic-catalog-price { grid-column:2; justify-items:start; }
          .emic-catalog-actions { gap:6px; }
          .emic-catalog-actions .btn { min-width:0; padding-inline:8px; }
        }
      `}</style>
    </div>
  );
}
