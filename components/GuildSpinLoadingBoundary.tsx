'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import GuildSpinLoader, { GUILD_SPIN_LOADING_DURATION_MS } from './GuildSpinLoader';

const SequenceComplete = createContext(true);

export function GuildSpinLoadingBoundary({ children }: { children: ReactNode }) {
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setComplete(true), GUILD_SPIN_LOADING_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <SequenceComplete.Provider value={complete}>
      {!complete && <GuildSpinLoader />}
      <div hidden={!complete} inert={!complete} aria-hidden={!complete ? true : undefined}>
        {children}
      </div>
    </SequenceComplete.Provider>
  );
}

// Route and data-loading fallbacks hold the completed grid after the entry timer.
export function GuildSpinRouteLoader() {
  return <GuildSpinLoader complete={useContext(SequenceComplete)} />;
}
