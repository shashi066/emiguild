'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Gamepad2, ChevronRight, ChevronLeft, Package,
  MapPin, FileText, CheckCircle, AlertCircle,
  Minus, Plus, Search, X,
} from 'lucide-react';

interface Props {
  enabled: boolean;
  pricePerDay: number;
  controllerPrice: number;
  groupedGames: Record<string, { id: string; name: string }[]>;
  userName: string;
  userPhone: string;
}

const STEPS = [
  { full: 'Duration & Controllers', short: 'Duration' },
  { full: 'Select Games', short: 'Games' },
  { full: 'Delivery Details', short: 'Delivery' },
  { full: 'Review & Confirm', short: 'Review' },
] as const;

const TERMS_AND_CONDITIONS = `
1. RENTAL PERIOD
   • The rental period begins from the date of delivery and ends at the agreed return date.
   • Extensions must be requested at least 24 hours before the rental period ends.
   • Late returns will be charged at the daily rental rate for each additional day.

2. PRICING & PAYMENT
   • Payment is collected at the time of delivery (Cash on Delivery).
   • The total amount includes the PS5 console rental and any extra controllers.
   • Prices are subject to change; your order locks in the price at the time of booking.

3. EQUIPMENT CARE
   • The PS5 console and controllers must be kept in a safe, clean, and dry environment.
   • Do not attempt to open, modify, or repair the equipment.
   • Keep the console in a well-ventilated area to prevent overheating.
   • Do not expose the equipment to extreme temperatures, moisture, or direct sunlight.

4. DAMAGE & LOSS
   • You are responsible for any damage to or loss of the equipment during the rental period.
   • Minor wear from normal use is expected and acceptable.
   • Significant damage (broken controllers, scratched console, liquid damage) will be charged at repair/replacement cost.
   • Loss or theft of equipment will be charged at full replacement value.

5. GAMES & ACCOUNTS
   • Games will be pre-downloaded on the console before delivery.
   • Do not delete pre-installed games or download additional content without permission.
   • Do not sign in with personal PlayStation accounts.

6. DELIVERY & RETURN
   • Delivery and pickup will be arranged at the address provided.
   • Someone must be present at the delivery address to receive and return the equipment.
   • The equipment must be returned in the same condition it was delivered.
   • All cables, controllers, and accessories must be returned together.

7. CANCELLATION
   • Orders can be cancelled before delivery at no charge.
   • Once delivered, no refunds will be provided for unused rental days.
   • EmiGuild reserves the right to cancel or refuse rental orders.

8. LIABILITY
   • EmiGuild is not responsible for any data loss, internet issues, or game progress.
   • The renter assumes full responsibility for the equipment during the rental period.
`.trim();

export default function Ps5RentalClient({
  enabled, pricePerDay, controllerPrice,
  groupedGames, userName, userPhone,
}: Props) {
  const [step, setStep] = useState(0);

  // Step 1 — Duration & Controllers
  const [days, setDays] = useState(1);
  const [extraControllers, setExtraControllers] = useState(0);

  // Step 2 — Games
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [gameSearch, setGameSearch] = useState('');

  // Step 3 — Delivery
  const [name, setName] = useState(userName);
  const [phone, setPhone] = useState(userPhone);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [notes, setNotes] = useState('');

  // Step 4 — Confirm
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // ── Price calculations ──
  const baseTotal = pricePerDay * days;
  const controllerTotal = controllerPrice * extraControllers * days;
  const totalPrice = baseTotal + controllerTotal;

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  // ── Validation ──
  const canProceedStep = (s: number): boolean => {
    if (s === 0) return days >= 1 && days <= 30;
    if (s === 1) return selectedGameIds.length >= 1 && selectedGameIds.length <= 5;
    if (s === 2) return name.trim().length > 0 && phone.trim().length >= 10 && address.trim().length >= 5 && city.trim().length > 0 && pincode.trim().length === 6;
    if (s === 3) return acceptedTerms;
    return false;
  };

  const toggleGame = (gameId: string) => {
    setSelectedGameIds((prev) => {
      if (prev.includes(gameId)) return prev.filter((id) => id !== gameId);
      if (prev.length >= 5) return prev;
      return [...prev, gameId];
    });
  };

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/ps5-rental', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rentalDays: days,
          extraControllers,
          selectedGameIds,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          deliveryAddress: address.trim(),
          deliveryCity: city.trim(),
          deliveryPincode: pincode.trim(),
          deliveryNotes: notes.trim() || undefined,
          acceptedTerms: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Something went wrong.');
        return;
      }
      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Disabled state ──
  if (!enabled) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 'var(--space-3xl)' }}>
        <Gamepad2 size={48} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }} />
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 'var(--space-sm)' }}>
          PS5 Rental Unavailable
        </h2>
        <p style={{ color: 'var(--color-text-muted)' }}>
          The PS5 home rental service is currently not available. Please check back later!
        </p>
      </div>
    );
  }

  // ── Success state ──
  if (success) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 'var(--space-3xl)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(16, 185, 129, 0.15)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto var(--space-lg)',
        }}>
          <CheckCircle size={32} style={{ color: '#10b981' }} />
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 'var(--space-sm)' }}>
          Rental Order Placed!
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xl)', maxWidth: 440, margin: '0 auto var(--space-xl)' }}>
          Your PS5 rental request has been submitted. We&apos;ll confirm your order and arrange delivery soon. Payment will be collected on delivery.
        </p>
        <div className="card" style={{
          background: 'var(--rental-accent-surface, rgba(108, 99, 255, 0.06))', border: '1px solid var(--rental-accent-border, rgba(108, 99, 255, 0.2))',
          padding: 'var(--space-lg)', maxWidth: 360, margin: '0 auto var(--space-xl)',
          textAlign: 'left',
        }}>
          <div style={{ display: 'grid', gap: 'var(--space-sm)', fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Duration</span>
              <span style={{ fontWeight: 600 }}>{days} day{days > 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Controllers</span>
              <span style={{ fontWeight: 600 }}>1 + {extraControllers} extra</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Games</span>
              <span style={{ fontWeight: 600 }}>{selectedGameIds.length} selected</span>
            </div>
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-sm)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700 }}>Total</span>
              <span style={{ fontWeight: 700, color: 'var(--color-accent-primary)', fontFamily: 'Orbitron, sans-serif' }}>{fmt(totalPrice)}</span>
            </div>
          </div>
        </div>
        <Link href="/" className="btn btn-primary">Back to Home</Link>
      </div>
    );
  }

  return (
    <div className="ps5-rental-shell">
      {/* ── Header ── */}
      <div className="ps5-rental-header">
        <div className="section-tag">PS5 Home Rental</div>
        <h1 className="page-title">
          Rent a PS5 <span className="text-gradient">Delivered to You</span>
        </h1>
        <p className="page-subtitle">
          Get a PS5 console with your favorite games delivered to your doorstep.
          Play at home, return when done. It&apos;s that simple.
        </p>
      </div>

      {/* ── Step Indicator ── */}
      <div className="ps5-steps">
        {STEPS.map((label, i) => (
          <div
            key={label.full}
            className={`ps5-step ${i === step ? 'ps5-step--active' : ''} ${i < step ? 'ps5-step--done' : ''}`}
            aria-current={i === step ? 'step' : undefined}
            aria-label={`Step ${i + 1}: ${label.full}`}
          >
            <div className="ps5-step-number">
              {i < step ? <CheckCircle size={16} /> : i + 1}
            </div>
            <span className="ps5-step-label ps5-step-label--full">{label.full}</span>
            <span className="ps5-step-label ps5-step-label--short" aria-hidden="true">{label.short}</span>
          </div>
        ))}
      </div>

      {/* ── Step Content ── */}
      <div className="card ps5-rental-flow-card">

        {/* ═══ Step 1: Duration & Controllers ═══ */}
        {step === 0 && (
          <div>
            <h2 className="ps5-rental-step-title">
              <Package size={20} style={{ color: 'var(--color-accent-primary)' }} />
              Rental Duration & Controllers
            </h2>

            <div style={{ display: 'grid', gap: 'var(--space-xl)' }}>
              {/* Days */}
              <div className="form-group">
                <label className="form-label" htmlFor="rental-days">Number of Days</label>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
                  Choose how many days you want to rent the PS5 (1–30 days).
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setDays((d) => Math.max(1, d - 1))}
                    disabled={days <= 1}
                    id="rental-days-minus" aria-label="Decrease rental days"
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    id="rental-days"
                    type="number"
                    className="form-input"
                    style={{ width: 80, textAlign: 'center', fontFamily: 'Orbitron, sans-serif', fontWeight: 700, fontSize: '1.1rem' }}
                    min={1}
                    max={30}
                    value={days}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setDays(Math.min(30, Math.max(1, v)));
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setDays((d) => Math.min(30, d + 1))}
                    disabled={days >= 30}
                    id="rental-days-plus" aria-label="Increase rental days"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Extra Controllers */}
              <div className="form-group">
                <label className="form-label">Extra Controllers</label>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
                  1 controller is included free. Add up to 3 extra controllers ({fmt(controllerPrice)}/day each).
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setExtraControllers((c) => Math.max(0, c - 1))}
                    disabled={extraControllers <= 0}
                    id="extra-controllers-minus" aria-label="Remove extra controller"
                  >
                    <Minus size={16} />
                  </button>
                  <span style={{ fontFamily: 'Orbitron, sans-serif', fontWeight: 700, fontSize: '1.1rem', minWidth: 40, textAlign: 'center' }}>
                    {extraControllers}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setExtraControllers((c) => Math.min(3, c + 1))}
                    disabled={extraControllers >= 3}
                    id="extra-controllers-plus" aria-label="Add extra controller"
                  >
                    <Plus size={16} />
                  </button>
                  <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    ({1 + extraControllers} total controller{extraControllers > 0 ? 's' : ''})
                  </span>
                </div>
              </div>

              {/* Price Breakdown */}
              <div style={{
                background: 'var(--rental-accent-surface, rgba(108, 99, 255, 0.06))',
                border: '1px solid var(--rental-accent-border, rgba(108, 99, 255, 0.2))',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-lg)',
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 'var(--space-md)' }}>Price Breakdown</div>
                <div style={{ display: 'grid', gap: 'var(--space-xs)', fontSize: '0.88rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>PS5 + 1 Controller</span>
                    <span>{fmt(pricePerDay)} × {days} day{days > 1 ? 's' : ''} = <strong>{fmt(baseTotal)}</strong></span>
                  </div>
                  {extraControllers > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Extra Controller{extraControllers > 1 ? 's' : ''} ({extraControllers})</span>
                      <span>{fmt(controllerPrice)} × {extraControllers} × {days} = <strong>{fmt(controllerTotal)}</strong></span>
                    </div>
                  )}
                  <div style={{
                    borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-sm)',
                    marginTop: 'var(--space-xs)',
                    display: 'flex', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>Total</span>
                    <span style={{
                      fontFamily: 'Orbitron, sans-serif', fontWeight: 700, fontSize: '1.15rem',
                      color: 'var(--color-accent-primary)',
                    }}>{fmt(totalPrice)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Step 2: Select Games ═══ */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Gamepad2 size={20} style={{ color: 'var(--color-accent-primary)' }} />
              Select Games
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }}>
              Choose up to 5 games to pre-download on your PS5. ({selectedGameIds.length}/5 selected)
            </p>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 'var(--space-lg)' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input
                className="form-input"
                placeholder="Search games..."
                value={gameSearch}
                onChange={(e) => setGameSearch(e.target.value)}
                style={{ paddingLeft: 36 }}
                id="game-search" aria-label="Search rental games"
              />
              {gameSearch && (
                <button
                  type="button"
                  onClick={() => setGameSearch('')}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)',
                    padding: 4,
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Selected chips */}
            {selectedGameIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-lg)' }}>
                {selectedGameIds.map((gameId) => {
                  const game = Object.values(groupedGames).flat().find((item) => item.id === gameId);
                  return game ? (
                  <button
                    key={gameId}
                    type="button"
                    onClick={() => toggleGame(gameId)}
                    className="ps5-game-chip ps5-game-chip--selected"
                  >
                    {game.name} <X size={12} />
                  </button>
                  ) : null;
                })}
              </div>
            )}

            {/* Game categories */}
            <div style={{ display: 'grid', gap: 'var(--space-xl)', maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
              {Object.entries(groupedGames).map(([category, games]) => {
                const filtered = games.filter((g) =>
                  g.name.toLowerCase().includes(gameSearch.toLowerCase())
                );
                if (filtered.length === 0) return null;
                return (
                  <div key={category}>
                    <div style={{
                      fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-accent-primary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      marginBottom: 'var(--space-sm)',
                    }}>
                      {category}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {filtered.map((game) => {
                        const isSelected = selectedGameIds.includes(game.id);
                        const isDisabled = !isSelected && selectedGameIds.length >= 5;
                        return (
                          <button
                            key={game.id}
                            type="button"
                            onClick={() => !isDisabled && toggleGame(game.id)}
                            disabled={isDisabled}
                            className={`ps5-game-chip ${isSelected ? 'ps5-game-chip--selected' : ''} ${isDisabled ? 'ps5-game-chip--disabled' : ''}`}
                          >
                            {game.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ Step 3: Delivery Details ═══ */}
        {step === 2 && (
          <div>
            <h2 className="ps5-rental-step-title">
              <MapPin size={20} style={{ color: 'var(--color-accent-primary)' }} />
              Delivery Address
            </h2>

            <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
              <div className="ps5-rental-form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="rental-name">Full Name</label>
                  <input id="rental-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="rental-phone">Phone Number</label>
                  <input id="rental-phone" className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit phone" maxLength={15} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="rental-address">Delivery Address</label>
                <textarea
                  id="rental-address"
                  className="form-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House/Flat no., Street, Landmark..."
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="ps5-rental-form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="rental-city">City</label>
                  <input id="rental-city" className="form-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="rental-pincode">Pincode</label>
                  <input id="rental-pincode" className="form-input" value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="6-digit pincode" maxLength={6} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="rental-notes">Delivery Notes <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></label>
                <input id="rental-notes" className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions for delivery..." />
              </div>
            </div>
          </div>
        )}

        {/* ═══ Step 4: Review & Confirm ═══ */}
        {step === 3 && (
          <div>
            <h2 className="ps5-rental-step-title">
              <FileText size={20} style={{ color: 'var(--color-accent-primary)' }} />
              Review Your Order
            </h2>

            <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
              {/* Order summary */}
              <div style={{
                background: 'var(--rental-accent-surface, rgba(108, 99, 255, 0.06))', border: '1px solid var(--rental-accent-border, rgba(108, 99, 255, 0.2))',
                borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)',
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 'var(--space-md)' }}>Order Summary</div>
                <div style={{ display: 'grid', gap: 'var(--space-sm)', fontSize: '0.88rem' }}>
                  <Row label="Rental Duration" value={`${days} day${days > 1 ? 's' : ''}`} />
                  <Row label="Controllers" value={`1 included + ${extraControllers} extra`} />
                  <Row label="PS5 Base" value={fmt(baseTotal)} />
                  {extraControllers > 0 && <Row label="Extra Controllers" value={fmt(controllerTotal)} />}
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-sm)' }}>
                    <Row label="Total" value={fmt(totalPrice)} bold />
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                    Payment: Cash on Delivery
                  </div>
                </div>
              </div>

              {/* Games */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 'var(--space-sm)' }}>Selected Games</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedGameIds.map((gameId) => {
                    const game = Object.values(groupedGames).flat().find((item) => item.id === gameId);
                    return game ? <span key={gameId} className="ps5-game-chip ps5-game-chip--selected" style={{ cursor: 'default' }}>{game.name}</span> : null;
                  })}
                </div>
              </div>

              {/* Delivery */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 'var(--space-sm)' }}>Delivery Details</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                  <div>{name} • {phone}</div>
                  <div>{address}</div>
                  <div>{city} — {pincode}</div>
                  {notes && <div style={{ fontStyle: 'italic', color: 'var(--color-text-muted)' }}>Note: {notes}</div>}
                </div>
              </div>

              {/* Terms */}
              <div style={{
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                padding: 'var(--space-md)',
              }}>
                <button
                  type="button"
                  onClick={() => setShowTerms(!showTerms)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    color: 'var(--color-text-primary)', fontWeight: 600, fontSize: '0.88rem',
                  }}
                  id="toggle-terms-btn"
                >
                  <FileText size={16} style={{ color: 'var(--color-accent-primary)' }} />
                  Terms & Conditions
                  <ChevronRight size={16} style={{
                    marginLeft: 'auto',
                    transform: showTerms ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.2s',
                  }} />
                </button>
                {showTerms && (
                  <pre style={{
                    marginTop: 'var(--space-md)', fontSize: '0.76rem',
                    color: 'var(--color-text-muted)', lineHeight: 1.7,
                    whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto',
                    fontFamily: 'inherit',
                  }}>
                    {TERMS_AND_CONDITIONS}
                  </pre>
                )}
              </div>

              {/* Accept checkbox */}
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                fontSize: '0.88rem',
              }}>
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  style={{ marginTop: 3, accentColor: 'var(--color-accent-primary)' }}
                  id="accept-terms-checkbox"
                />
                <span>
                  I agree to the <strong>Terms & Conditions</strong> and understand that payment will be collected on delivery.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="alert alert-error" role="alert" style={{ marginTop: 'var(--space-lg)' }}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="ps5-rental-actions">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => { setStep(step - 1); setError(''); }} id="step-back-btn">
              <ChevronLeft size={16} />
              Back
            </button>
          ) : <div />}

          {step < 3 ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canProceedStep(step)}
              onClick={() => setStep(step + 1)}
              id="step-next-btn"
            >
              Next
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!acceptedTerms || submitting}
              onClick={handleSubmit}
              id="submit-rental-btn"
            >
              {submitting ? 'Placing Order…' : 'Place Rental Order'}
              <CheckCircle size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: bold ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{
        fontWeight: bold ? 700 : 600,
        ...(bold ? { fontFamily: 'Orbitron, sans-serif', fontSize: '1.05rem', color: 'var(--color-accent-primary)' } : {}),
      }}>{value}</span>
    </div>
  );
}
