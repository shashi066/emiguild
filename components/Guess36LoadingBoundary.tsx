'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Guess36Loader, { GUESS36_LOADING_DURATION_MS } from './Guess36Loader';

const SequenceComplete = createContext(true);

export function Guess36LoadingBoundary({ children }: { children: ReactNode }) {
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setComplete(true), GUESS36_LOADING_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return <SequenceComplete.Provider value={complete}>
    {!complete && <Guess36Loader />}
    <div hidden={!complete} inert={!complete} aria-hidden={!complete ? true : undefined}>{children}</div>
  </SequenceComplete.Provider>;
}

export function Guess36RouteLoader() {
  return <Guess36Loader complete={useContext(SequenceComplete)} />;
}
