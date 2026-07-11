'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem('emiguild-install-dismissed');
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedTime < sevenDays) {
        return; // Still within the 7-day dismiss window
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Small delay so the page loads fully before showing banner
      setTimeout(() => setShowBanner(true), 2000);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
      console.log('[PWA] App installed successfully');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('[PWA] User accepted install');
      } else {
        console.log('[PWA] User dismissed install');
      }
    } catch (err) {
      console.error('[PWA] Install error:', err);
    }

    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('emiguild-install-dismissed', Date.now().toString());
  };

  if (isInstalled || !showBanner) return null;

  return (
    <div className="pwa-install-banner" id="pwa-install-banner">
      <div className="pwa-install-content">
        <div className="pwa-install-info">
          <div className="pwa-install-icon-wrap">
            <img src="/icons/icon-192.png" alt="EmiGuild" className="pwa-install-app-icon" width={40} height={40} />
          </div>
          <div className="pwa-install-text">
            <strong className="pwa-install-title">📱 Install EmiGuild</strong>
            <span className="pwa-install-subtitle">Book Slots • Join Tournaments • Daily Spin</span>
          </div>
        </div>
        <div className="pwa-install-actions">
          <button className="btn btn-primary btn-sm pwa-install-btn" onClick={handleInstall}>
            Install
          </button>
          <button
            className="pwa-install-dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss install banner"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
