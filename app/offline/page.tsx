'use client';

import { useEffect } from 'react';

export default function OfflinePage() {
  useEffect(() => {
    // Check connectivity periodically
    const interval = setInterval(() => {
      if (navigator.onLine) {
        window.location.reload();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="offline-page">
      <div className="offline-content">
        {/* Decorative background orbs */}
        <div className="offline-orb offline-orb-1" />
        <div className="offline-orb offline-orb-2" />

        <div className="offline-icon">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>

        <h1 className="offline-title">You&apos;re Offline</h1>
        <p className="offline-description">
          It looks like you&apos;ve lost your internet connection.
          <br />
          Some cached pages may still be available.
        </p>

        <button
          className="btn btn-primary offline-retry-btn"
          onClick={() => window.location.reload()}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Try Again
        </button>

        <p className="offline-hint">
          We&apos;ll automatically reconnect when your network is back.
        </p>
      </div>
    </div>
  );
}
