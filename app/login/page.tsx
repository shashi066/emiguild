'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Gamepad2, Mail, Lock, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password. Please try again.');
      } else {
        const requestedUrl = new URLSearchParams(window.location.search).get('callbackUrl');
        const callbackUrl = requestedUrl?.startsWith('/') && !requestedUrl.startsWith('//')
          ? requestedUrl
          : '/';
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Background orbs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: '-200px', right: '-200px',
          width: '600px', height: '600px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(108,99,255,0.15) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-150px', left: '-150px',
          width: '500px', height: '500px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,212,255,0.1) 0%, transparent 70%)',
        }} />
      </div>

      <div className="auth-card animate-fade-in-up">
        {/* Logo */}
        <div className="auth-logo">
          <Link href="/" className="navbar-logo" style={{ justifyContent: 'center', fontSize: '1.5rem' }}>
            <Gamepad2 size={28} />
            GameZone
          </Link>
        </div>

        <h1 className="auth-title">Welcome Back</h1>
        <p className="auth-subtitle">Sign in to your account to book your gaming session</p>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} id="login-form">
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              <Mail size={13} style={{ display: 'inline', marginRight: 4 }} />
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              <Lock size={13} style={{ display: 'inline', marginRight: 4 }} />
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                type={showPwd ? 'text' : 'password'}
                className="form-input"
                placeholder="Enter your password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                autoComplete="current-password"
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                }}
                tabIndex={-1}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p style={{
              fontSize: '0.78rem',
              marginTop: 6,
              textAlign: 'right',
            }}>
              <Link href="/forgot-password" style={{ color: 'var(--color-accent-secondary)' }}>
                Forgot password?
              </Link>
            </p>
          </div>



          <button
            type="submit"
            id="login-submit-btn"
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px' }}
            disabled={loading}
          >
            {loading ? (
              <>Loading...</>
            ) : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="auth-divider" style={{ marginTop: 'var(--space-lg)' }}>
          <span>Don&apos;t have an account?</span>
        </div>

        <Link href="/register" className="btn btn-ghost" style={{ width: '100%', marginTop: 'var(--space-sm)' }}>
          Create Account
        </Link>
      </div>
    </div>
  );
}
