"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { AdminBookingModalShell } from './AdminBookingModalShell';
import type { AdminRental } from '@/types/ps5-rental';
import { calculatePs5RentalTotal, discountedRentalTotal, rentalEndDate } from '@/lib/ps5-rental';

type Customer = { id: string; name: string; email: string };
export function RentalForm({ rental, defaults, onClose, onSaved }: { rental: AdminRental | null; defaults: { pricePerDay: number; controllerPrice: number }; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    customerName: rental?.customerName ?? '', customerPhone: rental?.customerPhone ?? '',
    deliveryAddress: rental?.deliveryAddress ?? '', deliveryCity: rental?.deliveryCity ?? '', deliveryPincode: rental?.deliveryPincode ?? '',
    deliveryNotes: rental?.deliveryNotes ?? '', adminComment: rental?.adminComment ?? '',
    rentalDays: rental?.rentalDays ?? 1, extraControllers: rental?.extraControllers ?? 0,
    pricePerDay: rental?.pricePerDay ?? defaults.pricePerDay, controllerPrice: rental?.controllerPrice ?? defaults.controllerPrice,
    discount: rental?.discount ?? 0, startDate: rental?.startDate ?? '',
  });
  const [selectedGames, setSelectedGames] = useState<string[]>(rental ? JSON.parse(rental.selectedGames) : []);
  const [games, setGames] = useState<string[]>([]);
  const [users, setUsers] = useState<Customer[]>([]);
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');
  const [customerType, setCustomerType] = useState('guest');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const responses = await Promise.all([fetch('/api/games'), ...(!rental ? [fetch('/api/admin/users')] : [])]);
        if (responses.some((response) => !response.ok)) throw new Error('Could not load rental options. Close and try again.');
        const [catalog, customers] = await Promise.all(responses.map((response) => response.json()));
        if (!alive) return;
        setGames(catalog.map((game: { name: string }) => game.name));
        setUsers(customers?.users ?? []); setReady(true);
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : 'Could not load options.'); }
    }
    void load(); return () => { alive = false; };
  }, [rental]);
  const subtotal = calculatePs5RentalTotal(form.pricePerDay, form.controllerPrice, form.rentalDays, form.extraControllers);
  const total = discountedRentalTotal(form.pricePerDay, form.controllerPrice, form.rentalDays, form.extraControllers, form.discount);
  const returnDate = /^\d{4}-\d{2}-\d{2}$/.test(form.startDate) && Number.isFinite(Date.parse(form.startDate)) && Number.isFinite(form.rentalDays) ? rentalEndDate(form.startDate, form.rentalDays) : '';
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      if (!rental && customerType === 'user' && !userId) throw new Error('Select a registered customer.');
      const response = await fetch(rental ? `/api/admin/ps5-rentals/${rental.id}` : '/api/admin/ps5-rentals', {
        method: rental ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, startDate: form.startDate || null, selectedGames,
          ...(rental ? { expectedUpdatedAt: rental.updatedAt } : { userId: customerType === 'user' ? userId : null }) }),
      });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Save failed.');
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Save failed.'); } finally { setBusy(false); }
  }
  return <AdminBookingModalShell labelledBy="rental-form-title" onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={save}>
      <h2 id="rental-form-title">{rental ? 'Edit Rental' : 'New Walk-in Rental'}</h2>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
      {!rental && <div className="form-group">
        <label className="form-label" htmlFor="rental-customer-type">Customer type</label>
        <select id="rental-customer-type" className="form-input" value={customerType} onChange={(e) => setCustomerType(e.target.value)}><option value="guest">Guest</option><option value="user">Registered user</option></select>
        {customerType === 'user' && <>
          <label className="form-label" htmlFor="rental-user-search">Search customers</label>
          <input id="rental-user-search" className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" />
          <label className="form-label" htmlFor="rental-user">Registered customer</label>
          <select id="rental-user" className="form-input" value={userId} required onChange={(e) => { setUserId(e.target.value); const user = users.find((item) => item.id === e.target.value); if (user) setForm({ ...form, customerName: user.name || '' }); }}>
            <option value="">Select customer</option>{users.filter((user) => user.id === userId || `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase())).map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}
          </select>
        </>}
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 16, marginTop: 16 }}>
        {([['customerName', 'Customer name'], ['customerPhone', 'Phone'], ['deliveryAddress', 'Delivery address'], ['deliveryCity', 'City'], ['deliveryPincode', 'Pincode'], ['deliveryNotes', 'Delivery notes'], ['adminComment', 'Admin notes']] as const).map(([key, label]) => <div className="form-group" key={key}>
          <label className="form-label" htmlFor={`rental-${key}`}>{label}</label><input id={`rental-${key}`} className="form-input" value={form[key]} required={!['deliveryNotes', 'adminComment'].includes(key)} maxLength={key === 'customerName' || key === 'deliveryCity' ? 100 : 500} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        </div>)}
        <div className="form-group"><label className="form-label" htmlFor="rental-start">Start date</label><input id="rental-start" className="form-input" type="date" required={!rental || ['CONFIRMED', 'DELIVERED'].includes(rental.status)} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /><small>Return date: {returnDate || 'Choose a start date'}</small></div>
        {([['rentalDays', 'Rental days', 1, 30], ['extraControllers', 'Extra controllers', 0, 3], ['pricePerDay', 'Daily rental rate (₹)', 0, 100000], ['controllerPrice', 'Daily rate per extra controller (₹)', 0, 100000], ['discount', 'Discount % (0 or 10–100)', 0, 100]] as const).map(([key, label, min, max]) => <div className="form-group" key={key}><label className="form-label" htmlFor={`rental-${key}`}>{label}</label><input id={`rental-${key}`} className="form-input" type="number" required min={min} max={max} step={1} value={Number.isNaN(form[key]) ? '' : form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value === '' ? NaN : Number(e.target.value) })} /></div>)}
      </div>
      <fieldset style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }}><legend>Games (choose 1–5)</legend>
        {!ready && <p>Loading options...</p>}
        <div style={{ maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 8 }}>{Array.from(new Set([...games, ...selectedGames])).map((name) => <label key={name} style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={selectedGames.includes(name)} disabled={!selectedGames.includes(name) && selectedGames.length >= 5} onChange={(e) => setSelectedGames(e.target.checked ? [...selectedGames, name] : selectedGames.filter((item) => item !== name))} />{name}</label>)}</div>
      </fieldset>
      <div aria-live="polite" style={{ marginBlock: 16 }}>Subtotal: ₹{subtotal.toLocaleString('en-IN')} · Discount: ₹{(subtotal - total).toLocaleString('en-IN')} ({form.discount}%)<br /><strong>Total: ₹{total.toLocaleString('en-IN')}</strong></div>
      <div style={{ display: 'flex', gap: 12 }}><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!ready || busy}>{busy ? 'Saving...' : 'Save Rental'}</button></div>
      </fieldset>
    </form>
  </AdminBookingModalShell>;
}
