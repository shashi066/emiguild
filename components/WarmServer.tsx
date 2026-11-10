'use client';

import { useEffect } from 'react';
import { warmServer } from '@/lib/warm-server';

// Sends one warm-up request once the page is idle, so it never competes with the page's own loading.
export default function WarmServer() {
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warmServer, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(warmServer, 1500);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
