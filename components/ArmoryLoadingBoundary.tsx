'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import ArmoryLoader, { ARMORY_LOADING_DURATION_MS } from './ArmoryLoader';

const SequenceComplete = createContext(true);

export function ArmoryLoadingBoundary({ children }: { children: ReactNode }) {
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setComplete(true), ARMORY_LOADING_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return <SequenceComplete.Provider value={complete}>
    {!complete && <ArmoryLoader />}
    <div hidden={!complete} inert={!complete} aria-hidden={!complete ? true : undefined}>{children}</div>
  </SequenceComplete.Provider>;
}

// Hidden fallbacks mount immediately; after entry they hold the final frame.
export function ArmoryRouteLoader() {
  return <ArmoryLoader complete={useContext(SequenceComplete)} />;
}
