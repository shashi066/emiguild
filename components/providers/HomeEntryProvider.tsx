'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { advanceHomeEntryNavigation, createHomeEntryNavigation, shouldShowHomeEntry } from '@/lib/home-entry-policy';

const HomeEntryContext = createContext(false);

/** Lives above route groups: returning Home is not a fresh document entry. */
export function HomeEntryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [navigation, setNavigation] = useState(() => createHomeEntryNavigation(pathname));
  const current = advanceHomeEntryNavigation(navigation, pathname);
  // Adjust this component's state during render, rather than in an effect, so
  // descendants never commit a stale branded loader for an internal return.
  if (current !== navigation) setNavigation(current);
  const allowed = shouldShowHomeEntry(current);
  return <HomeEntryContext.Provider value={allowed}>
    <span hidden data-home-entry-allowed={allowed ? 'true' : undefined} />
    {children}
  </HomeEntryContext.Provider>;
}

export function useHomeEntryAllowed() { return useContext(HomeEntryContext); }
