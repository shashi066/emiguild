'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import TowerLoader, { TOWER_LOADING_DURATION_MS } from './TowerLoader';
import styles from './tower-loader.module.css';

const SequenceComplete = createContext(true);

export function useTowerLoadingComplete() {
  return useContext(SequenceComplete);
}

// Keep one sequence across the route fallback and the hydrated game.
export function TowerLoadingBoundary({ children }: { children: ReactNode }) {
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setComplete(true), TOWER_LOADING_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <SequenceComplete.Provider value={complete}>
      {!complete && <div className={styles.route}><TowerLoader /></div>}
      <div hidden={!complete} inert={!complete} aria-hidden={!complete ? true : undefined}>
        {children}
      </div>
    </SequenceComplete.Provider>
  );
}

export function TowerRouteLoader() {
  return <TowerLoader complete={useTowerLoadingComplete()} />;
}
