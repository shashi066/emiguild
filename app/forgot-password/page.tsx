'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Gamepad2, KeyRound, Mail, ArrowLeft, AlertCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok || data.emailSent !== true) {
        setError(data.error ?? 'Unable to process your request. Please try again.');
        return;
      }

      setMessage(data.message);
    } catch {
      setError('Unable to process your request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-in-up">
        <div className="auth-logo">
          <Link href="/" className="navbar-logo" style={{ justifyContent: 'center', fontSize: '1.5rem' }}>
            <Gamepad2 size={28} />
            EmiGuild
          </Link>
        </div>

        {message ? (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle size={48} style={{ color: 'var(--color-accent-success)', marginBottom: 16 }} />
            <h1 className="auth-title">Check Your Email</h1>
            <p className="auth-subtitle" style={{ lineHeight: 1.6 }}>{message}</p>
            <Link href="/login" className="btn btn-primary" style={{ width: '100%' }}>
              <ArrowLeft size={16} />
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <h1 className="auth-title">Forgot Password</h1>
            <p className="auth-subtitle">
              Enter your registered email and we will send you a temporary password.
            </p>

            {error && (
              <div className="alert alert-error">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="forgot-email">
                  <Mail size={13} style={{ display: 'inline', marginRight: 4 }} />
                  Email Address
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: 14 }}
                disabled={loading}
              >
                <KeyRound size={17} />
                {loading ? 'Sending...' : 'Send Temporary Password'}
              </button>
            </form>

            <Link
              href="/login"
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: 'var(--space-md)' }}
            >
              <ArrowLeft size={16} />
              Back to Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
