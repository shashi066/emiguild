'use client';

import { useEffect, useState } from 'react';

export function ServiceWorkerRegistrar() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        console.log('[PWA] Service worker registered:', registration.scope);

        // Check for updates on registration
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // A new service worker is installed but waiting to activate
              console.log('[PWA] New version available');
              setWaitingWorker(newWorker);
              setUpdateAvailable(true);
            }
          });
        });

        // Also check if there's already a waiting worker
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setUpdateAvailable(true);
        }
      } catch (error) {
        console.error('[PWA] Service worker registration failed:', error);
      }
    };

    // Register after page loads to not block rendering
    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
      return () => window.removeEventListener('load', registerSW);
    }
  }, []);

  // Listen for controller change (happens when skipWaiting is called)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage('SKIP_WAITING');
    }
  };

  if (!updateAvailable) return null;

  return (
    <div className="pwa-update-toast">
      <div className="pwa-update-content">
        <span className="pwa-update-icon">🔄</span>
        <span className="pwa-update-text">New update available</span>
        <button className="pwa-update-btn" onClick={handleUpdate}>
          Refresh
        </button>
        <button
          className="pwa-update-dismiss"
          onClick={() => setUpdateAvailable(false)}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
