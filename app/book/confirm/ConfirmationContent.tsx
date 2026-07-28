'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CheckCircle, Calendar, Clock, Monitor,
  IndianRupee, BookOpen, Home, Gamepad2, Loader2, AlertCircle,
} from 'lucide-react';
import { formatTime, formatDate, formatCurrency } from '@/lib/utils';

interface Booking {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  extraControllers: number;
  notes: string | null;
  status: string;
  paymentStatus: string;
  station: { name: string };
}

export default function ConfirmationContent() {
  const params    = useSearchParams();
  const bookingId = params.get('id') ?? '';

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!bookingId) { setError('No booking ID provided.'); setLoading(false); return; }
    fetch(`/api/bookings/${bookingId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => setBooking(d.booking))
      .catch((status) => setError(status === 403 ? 'Access denied.' : 'Booking not found.'))
      .finally(() => setLoading(false));
  }, [bookingId]);

  if (loading) {
    return (
      <div className="page-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-accent-primary)' }} />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="page-wrapper">
        <div className="container-sm">
          <div className="card" style={{ textAlign: 'center' }}>
            <AlertCircle size={40} style={{ color: 'var(--color-accent-error)', marginBottom: 16 }} />
            <h2>{error || 'Booking not found.'}</h2>
            <Link href="/" className="btn btn-primary" style={{ marginTop: 16 }}>Back to Home</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <div className="container-sm">
        <div className="card confirmation-card animate-fade-in-up" style={{ textAlign: 'center' }}>

          {/* Animated success icon */}
          <div className="confirmation-icon">
            <CheckCircle size={40} />
          </div>

          <h1
            className="font-orbitron"
            style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 8 }}
          >
            Booking <span className="text-gradient">Confirmed!</span>
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xl)' }}>
            Your gaming session has been reserved. Show this screen at the counter when you arrive.
          </p>

          {/* Booking ID pill */}
          <div
            style={{
              display: 'inline-block',
              padding: '6px 18px',
              background: 'rgba(108, 99, 255, 0.1)',
              border: '1px solid rgba(108, 99, 255, 0.3)',
              borderRadius: 'var(--radius-full)',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              color: 'var(--color-accent-primary)',
              marginBottom: 'var(--space-xl)',
              letterSpacing: '0.05em',
            }}
          >
            Booking ID: #{booking.id.slice(-8).toUpperCase()}
          </div>

          {/* Details grid */}
          <div className="booking-details-grid">
            <div className="booking-detail-item">
              <div className="booking-detail-label">
                <Monitor size={12} style={{ display: 'inline', marginRight: 4 }} />Station
              </div>
              <div className="booking-detail-value">{booking.station.name}</div>
            </div>
            <div className="booking-detail-item">
              <div className="booking-detail-label">
                <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />Date
              </div>
              <div className="booking-detail-value">{formatDate(booking.date)}</div>
            </div>
            <div className="booking-detail-item">
              <div className="booking-detail-label">
                <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />Start Time
              </div>
              <div className="booking-detail-value">{formatTime(booking.startTime)}</div>
            </div>
            <div className="booking-detail-item">
              <div className="booking-detail-label">
                <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />End Time
              </div>
              <div className="booking-detail-value">{formatTime(booking.endTime)}</div>
            </div>
            {booking.extraControllers > 0 && (
              <div className="booking-detail-item" style={{ gridColumn: '1 / -1' }}>
                <div className="booking-detail-label">
                  <Gamepad2 size={12} style={{ display: 'inline', marginRight: 4 }} />Extra Controllers
                </div>
                <div className="booking-detail-value">
                  {booking.extraControllers} extra controller{booking.extraControllers > 1 ? 's' : ''}
                </div>
              </div>
            )}
            {booking.notes && (
              <div
                className="booking-detail-item"
                style={{ gridColumn: '1 / -1', textAlign: 'left' }}
              >
                <div className="booking-detail-label">
                  <Gamepad2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                  Game Request
                </div>
                <div className="booking-detail-value">{booking.notes}</div>
                <div className="form-helper" style={{ marginTop: 5 }}>
                  We will do our best to prepare it before your session.
                </div>
              </div>
            )}
            <div
              className="booking-detail-item"
              style={{
                gridColumn: '1 / -1',
                background: 'rgba(0, 230, 118, 0.06)',
                borderColor: 'rgba(0, 230, 118, 0.2)',
              }}
            >
              <div className="booking-detail-label">
                <IndianRupee size={12} style={{ display: 'inline', marginRight: 4 }} />
                {booking.paymentStatus === 'PAID' ? 'Amount Paid' : 'Amount Due at Counter'}
              </div>
              <div
                className="booking-detail-value"
                style={{ fontSize: '1.5rem', color: 'var(--color-accent-success)' }}
              >
                {formatCurrency(booking.totalPrice)}
              </div>
            </div>
          </div>

          {/* Info note */}
          <div
            className="alert alert-info"
            style={{ marginBottom: 'var(--space-xl)', textAlign: 'left' }}
          >
            <Calendar size={16} style={{ flexShrink: 0 }} />
            <span>
              Please arrive <strong>5 minutes early</strong>. Your slot will be held for{' '}
              <strong>10 minutes</strong> after the start time.
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/my-bookings" className="btn btn-primary btn-lg" id="view-bookings-btn">
              <BookOpen size={18} />
              View My Bookings
            </Link>
            <Link href="/" className="btn btn-ghost btn-lg">
              <Home size={18} />
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
