'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { preload } from 'react-dom';
import { createHomepageProgress } from '@/lib/homepage-progress';
import HomeLogoLoader from './HomeLogoLoader';
import { useHomeEntryAllowed } from './providers/HomeEntryProvider';
import styles from './home-logo-loader.module.css';

const ProgressContext = createContext<ReturnType<typeof createHomepageProgress> | null>(null);

export function HomeLoadingBoundary({ children }: { children: ReactNode }) {
  const allowed = useHomeEntryAllowed();
  return allowed ? <BrandedHomeLoadingBoundary>{children}</BrandedHomeLoadingBoundary>
    : <ProgressContext.Provider value={null}>{children}</ProgressContext.Provider>;
}

function BrandedHomeLoadingBoundary({ children }: { children: ReactNode }) {
  preload('/images/home-loader-logo.webp', { as: 'image', fetchPriority: 'high' });
  const [controller] = useState(() => createHomepageProgress({ reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches }));
  const phase = useSyncExternalStore(controller.subscribe, controller.getPhase, () => 'loading' as const);
  const [fadeComplete, setFadeComplete] = useState(false);
  useEffect(() => {
    const sync = () => controller.setVisible(document.visibilityState === 'visible');
    sync(); controller.start();
    document.addEventListener('visibilitychange', sync);
    return () => { document.removeEventListener('visibilitychange', sync); controller.dispose(); };
  }, [controller]);
  useEffect(() => {
    if (phase !== 'loading') return;
    const chrome = Array.from(document.querySelectorAll<HTMLElement>('[data-site-chrome]'));
    const previous = chrome.map(element => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden'), visibility: element.style.visibility }));
    const rootOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    chrome.forEach(element => { element.inert = true; element.setAttribute('aria-hidden', 'true'); element.style.visibility = 'hidden'; });
    return () => {
      document.documentElement.style.overflow = rootOverflow;
      document.body.style.overflow = bodyOverflow;
      previous.forEach(({ element, inert, ariaHidden, visibility }) => {
        element.inert = inert; element.style.visibility = visibility;
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
    };
  }, [phase]);
  useEffect(() => {
    if (phase !== 'ready') { setFadeComplete(false); return; }
    const timer = setTimeout(() => setFadeComplete(true), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350);
    return () => clearTimeout(timer);
  }, [phase]);
  return <ProgressContext.Provider value={controller}>
    <div className={styles.boundary}>
      {phase !== 'error' && !fadeComplete && <div data-home-loader className={phase === 'ready' ? styles.departing : undefined} aria-hidden={phase === 'ready' ? true : undefined}><HomeLogoLoader controller={controller} /></div>}
      <div data-home-content data-pending={phase === 'loading' ? 'true' : undefined} className={styles.content}>{children}</div>
      <noscript><style>{'[data-home-loader]{display:none!important}[data-home-content]{display:block!important}[data-site-chrome]{visibility:visible!important;pointer-events:auto!important}'}</style></noscript>
    </div>
  </ProgressContext.Provider>;
}

export function useHomeHeroReady() {
  const controller = useContext(ProgressContext);
  useEffect(() => { controller?.mark('hero'); }, [controller]);
}
export function HomePageReady() {
  const controller = useContext(ProgressContext);
  useEffect(() => { controller?.mark('page'); }, [controller]);
  return null;
}
export function HomePending() {
  const controller = useContext(ProgressContext);
  return controller ? null : <div className={styles.pending} role="status" aria-live="polite">Loading home…</div>;
}

export function HomeLoadError({ reset }: { reset: () => void }) {
  const controller = useContext(ProgressContext);
  useEffect(() => { controller?.fail(); }, [controller]);
  return <div className="loading-state" role="alert"><h1>Home could not load</h1><p>Please try again.</p><button type="button" className="btn btn-secondary" onClick={() => { controller?.reset(); reset(); }}>Try again</button></div>;
}
