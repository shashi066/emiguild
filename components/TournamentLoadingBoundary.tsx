'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import TournamentLoader, { TOURNAMENT_LOADING_MS } from './TournamentLoader';

const LoadingContext = createContext({ complete: true, entryPath: '', initialLoaded: true, markLoaded: () => {} });

export function TournamentLoadingBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const entryPath = useRef(pathname).current;
  const [complete, setComplete] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setComplete(true), TOURNAMENT_LOADING_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return <LoadingContext.Provider value={{ complete, entryPath, initialLoaded, markLoaded: () => setInitialLoaded(true) }}>
    {!complete && <TournamentLoader />}
    <div hidden={!complete} inert={!complete} aria-hidden={!complete ? true : undefined}>{children}</div>
  </LoadingContext.Provider>;
}

export function useTournamentLoading(loading: boolean) {
  const { initialLoaded, markLoaded, entryPath } = useContext(LoadingContext);
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !initialLoaded && pathname === entryPath) markLoaded();
  }, [loading, initialLoaded, pathname, entryPath, markLoaded]);
}

export function TournamentRouteLoader() {
  const { complete, initialLoaded, entryPath } = useContext(LoadingContext);
  const pathname = usePathname();
  return <TournamentLoader complete={complete && !initialLoaded && pathname === entryPath} />;
}

export function TournamentLoadError({ retry }: { retry: () => void }) {
  return <div className="loading-state" role="alert">
    <p>Tournament information could not load. Please try again.</p>
    <button type="button" className="btn btn-secondary" onClick={retry}>Retry</button>
  </div>;
}
