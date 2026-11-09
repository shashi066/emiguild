'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Guess36Loader, { GUESS36_LOADING_DURATION_MS } from './Guess36Loader';
import styles from './guess36-mines.module.css';

const CompleteEntry = createContext<() => void>(() => {});
export function useCompleteGuess36Entry() { return useContext(CompleteEntry); }

export function Guess36LoadingBoundary({ children, skipInitial = false }: { children: ReactNode; skipInitial?: boolean }) {
  const [complete, setComplete] = useState(skipInitial);
  const finish = useCallback(() => setComplete(true), []);
  useEffect(() => {
    if (skipInitial) { setComplete(true); return; }
    if (complete) return;
    const timer = window.setTimeout(() => setComplete(true), GUESS36_LOADING_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [skipInitial, complete]);
  const visible = complete || skipInitial;
  return <CompleteEntry.Provider value={finish}>
    {!visible && <Guess36Loader />}
    <div hidden={!visible} inert={!visible} aria-hidden={!visible ? true : undefined}>{children}</div>
  </CompleteEntry.Provider>;
}

export function Guess36RouteLoader() {
  return <div className={styles.loading} role="status"><span className="spinner" aria-hidden="true" />Loading Guild Expedition...</div>;
}
