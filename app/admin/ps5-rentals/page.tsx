'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Gamepad2, RefreshCw, CheckCircle, AlertCircle,
  Package, Truck, RotateCcw, XCircle,
  Phone, MapPin, User, Calendar, MessageSquare, Save, X,
} from 'lucide-react';

import type { AdminRental as Rental } from '@/types/ps5-rental';
import { RentalStatus, RentalGames } from '@/components/Ps5RentalDetails';
import { PS5_RENTAL_TRANSITIONS, type Ps5RentalOrderStatus } from '@/lib/ps5-rental';
import { AdminModalShell } from '@/components/admin/AdminModalShell';

const STATUS_TABS = ['ALL', 'PENDING', 'CONFIRMED', 'DELIVERED', 'RETURNED', 'CANCELLED'] as const;

const ACTIONS = {
  CONFIRMED: { label: 'Confirm', icon: CheckCircle },
  DELIVERED: { label: 'Mark Delivered', icon: Truck },
  RETURNED: { label: 'Mark Returned', icon: RotateCcw },
  CANCELLED: { label: 'Cancel', icon: XCircle },
};

export default function AdminPs5RentalsPage() {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const loadSequence = useRef(0);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [commentModal, setCommentModal] = useState<{ id: string; comment: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ps5-rentals?status=${filter}&page=${page}`);
      const data = await res.json();
      if (sequence !== loadSequence.current) return;
      if (!res.ok) throw new Error(data.error ?? 'Could not load rentals.');
      setRentals(data.rentals ?? []);
      setHasMore(!!data.hasMore);
    } catch {
      if (sequence === loadSequence.current) {
        setRentals([]); setHasMore(false);
        setToast({ type: 'error', msg: 'Could not load rentals. Please refresh.' });
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => { load(); }, [load]);

  const saveRental = async (id: string, patch: { status?: string; adminComment?: string }) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/ps5-rentals/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Update failed.');
      if (patch.status) await load();
      else setRentals((current) => current.map((rental) => rental.id === id ? data.rental : rental));
      setCommentModal(null);
      showToast('success', patch.status ? 'Rental updated.' : 'Comment saved.');
    } catch (cause) { showToast('error', cause instanceof Error ? cause.message : 'Update failed.'); }
    finally { setUpdatingId(null); }
  };

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };


  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Gamepad2 size={26} style={{ display: 'inline', marginRight: 10, color: 'var(--color-accent-primary)' }} />
            PS5 Rentals
            <span style={{
              fontSize: '0.75rem', fontWeight: 600,
              background: 'rgba(108,99,255,0.15)', color: 'var(--color-accent-primary)',
              borderRadius: 999, padding: '2px 10px', marginLeft: 10,
              verticalAlign: 'middle',
            }}>
              {rentals.length}
            </span>
          </h1>
          <p className="page-subtitle">Manage PS5 home rental orders</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} id="refresh-rentals-btn">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`alert ${toast.type === 'success' ? 'alert-success' : 'alert-error'}`}
          style={{ marginBottom: 'var(--space-lg)' }}
        >
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Status tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-xl)' }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`btn btn-sm ${filter === tab ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setFilter(tab); setPage(1); }}
            id={`tab-${tab.toLowerCase()}`}
          >
            {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="loading-state"><div className="spinner" />Loading rentals…</div>
      ) : rentals.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--color-text-muted)' }}>
          <Package size={40} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
          <div>No {filter !== 'ALL' ? filter.toLowerCase() : ''} rental orders found.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
          {rentals.map((rental) => {
            const actions = PS5_RENTAL_TRANSITIONS[rental.status as Ps5RentalOrderStatus] ?? [];

            return (
              <div key={rental.id} className="card" style={{ padding: 'var(--space-lg)' }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <User size={14} style={{ color: 'var(--color-text-muted)' }} />
                      <span style={{ fontWeight: 700 }}>{rental.customerName}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>({rental.user.email})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={12} /> {rental.customerPhone}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={12} /> {formatDate(rental.createdAt)}
                      </span>
                    </div>
                  </div>
                  <RentalStatus status={rental.status} />
                </div>

                {/* Details grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 'var(--space-md)', marginBottom: 'var(--space-md)',
                  background: 'rgba(255,255,255,0.02)', padding: 'var(--space-md)',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>Duration</div>
                    <div style={{ fontWeight: 600 }}>{rental.rentalDays} day{rental.rentalDays > 1 ? 's' : ''}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>Controllers</div>
                    <div style={{ fontWeight: 600 }}>1 + {rental.extraControllers} extra</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>Total Price</div>
                    <div style={{ fontWeight: 700, fontFamily: 'Orbitron, sans-serif', color: 'var(--color-accent-primary)' }}>
                      {fmt(rental.totalPrice)}
                    </div>
                  </div>
                </div>

                {/* Games */}
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>Games to Download</div>
                  <RentalGames value={rental.selectedGames} />
                </div>

                {/* Address */}
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontSize: '0.82rem', color: 'var(--color-text-secondary)',
                  marginBottom: 'var(--space-md)',
                }}>
                  <MapPin size={14} style={{ color: 'var(--color-text-muted)', marginTop: 2, flexShrink: 0 }} />
                  <div>
                    {rental.deliveryAddress}, {rental.deliveryCity} — {rental.deliveryPincode}
                    {rental.deliveryNotes && (
                      <div style={{ fontStyle: 'italic', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        Note: {rental.deliveryNotes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin comment */}
                {rental.adminComment && (
                  <div style={{
                    fontSize: '0.82rem', color: 'var(--color-text-muted)', fontStyle: 'italic',
                    marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'flex-start', gap: 6,
                  }}>
                    <MessageSquare size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                    Admin: {rental.adminComment}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  {actions.map((newStatus) => {
                    const { label, icon: Icon } = ACTIONS[newStatus as keyof typeof ACTIONS];
                    return (
                    <button
                      key={newStatus}
                      type="button"
                      className={`btn btn-sm ${newStatus === 'CANCELLED' ? 'btn-ghost' : 'btn-primary'}`}
                      onClick={() => saveRental(rental.id, { status: newStatus })}
                      disabled={updatingId === rental.id}
                      id={`action-${newStatus.toLowerCase()}-${rental.id}`}
                      style={newStatus === 'CANCELLED' ? { color: '#ef4444' } : {}}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ); })}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCommentModal({ id: rental.id, comment: rental.adminComment ?? '' })}
                    id={`comment-${rental.id}`}
                  >
                    <MessageSquare size={14} />
                    Comment
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Comment Modal */}
      <nav aria-label="Rental pages" style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
        <button className="btn btn-ghost" disabled={loading || page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
        <span>Page {page}</span>
        <button className="btn btn-ghost" disabled={loading || !hasMore} onClick={() => setPage((value) => value + 1)}>Next</button>
      </nav>
      {commentModal && (
        <AdminModalShell labelledBy="rental-comment-title" onClose={() => { if (!updatingId) setCommentModal(null); }} lightweight>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
              <h2 id="rental-comment-title" style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--color-accent-primary)' }}><MessageSquare size={18} /></span>
                Admin Comment
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setCommentModal(null)} id="modal-comment-close" aria-label="Close" disabled={!!updatingId}>
                <X size={18} />
              </button>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="admin-comment-input">Comment</label>
              <textarea
                id="admin-comment-input"
                className="form-input"
                rows={3}
                value={commentModal.comment}
                onChange={(e) => setCommentModal({ ...commentModal, comment: e.target.value })}
                placeholder="Add an admin note..."
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-xl)' }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setCommentModal(null)} disabled={!!updatingId}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => void saveRental(commentModal.id, { adminComment: commentModal.comment })} disabled={!!updatingId} id="modal-save-comment">
                <Save size={15} />
                {updatingId ? 'Saving…' : 'Save'}
              </button>
            </div>
        </AdminModalShell>
      )}
    </div>
  );
}
