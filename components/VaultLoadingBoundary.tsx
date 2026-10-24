'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import VaultLoader, { VAULT_LOADING_DURATION_MS } from './VaultLoader';

const SequenceComplete = createContext(true);

export function VaultLoadingBoundary({ children }: { children: ReactNode }) {
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setComplete(true), VAULT_LOADING_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <SequenceComplete.Provider value={complete}>
      {!complete && <VaultLoader />}
      <div hidden={!complete} inert={!complete} aria-hidden={!complete ? true : undefined}>
        {children}
      </div>
    </SequenceComplete.Provider>
  );
}

export function VaultRouteLoader({ compact = false }: { compact?: boolean }) {
  return <VaultLoader complete={useContext(SequenceComplete)} compact={compact} />;
}
