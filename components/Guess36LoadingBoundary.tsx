'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Guess36Loader, { GUESS36_LOADING_DURATION_MS } from './Guess36Loader';

const CompleteEntry = createContext<() => void>(() => {});
export function useCompleteGuess36Entry() { return useContext(CompleteEntry); }

export function Guess36LoadingBoundary({ children }: { children: ReactNode }) {
  const [complete, setComplete] = useState(false);
  const [playing, setPlaying] = useState(false);
  const finish = useCallback(() => setComplete(true), []);
  useEffect(() => {
    if (complete) return;
    // Start the CSS sequence and its clock together, after hydration.
    setPlaying(true);
    const timer = window.setTimeout(() => setComplete(true), GUESS36_LOADING_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [complete]);
  const visible = complete;
  return <CompleteEntry.Provider value={finish}>
    {!visible && <Guess36Loader playing={playing} />}
    <div hidden={!visible} inert={!visible} aria-hidden={!visible ? true : undefined}>{children}</div>
  </CompleteEntry.Provider>;
}

export function Guess36RouteLoader() {
  // The layout owns the intro. Hold its final frame only if data is still loading afterwards.
  return <Guess36Loader complete />;
}
