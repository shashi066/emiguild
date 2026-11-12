'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const IntroComplete = createContext(true);

// Shows a branded loader for a fixed time on entry, then reveals the page (the side-quest pattern,
// shared by Passes and Games). The page renders behind it meanwhile, hidden and inert.
export function TimedIntroBoundary({ durationMs, loader, children }: { durationMs: number; loader: ReactNode; children: ReactNode }) {
  const [complete, setComplete] = useState(false);
  // Keep server-rendered content free of inert/hidden so noscript can reveal it.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    const timer = window.setTimeout(() => setComplete(true), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs]);

  return <IntroComplete.Provider value={complete}>
    {!complete && <div data-catalog-intro-loader>{loader}</div>}
    <div data-catalog-intro-content style={!complete ? { display: 'none' } : undefined}
      hidden={hydrated && !complete} inert={hydrated && !complete} aria-hidden={hydrated && !complete ? true : undefined}>{children}</div>
    <noscript><style>{'[data-catalog-intro-loader]{display:none!important}[data-catalog-intro-content]{display:block!important}'}</style></noscript>
  </IntroComplete.Provider>;
}

// Route fallbacks mount hidden during the intro; if the server is still slower, they hold the final frame.
export function useIntroComplete() {
  return useContext(IntroComplete);
}
