'use client';

import { useEffect } from 'react';

const ENDPOINT = '/api/analytics/interaction';
const MARKER = 'homepage';

type TrackedWindow = Window & { __homepageVisitTracked?: true };

export default function HomepageVisitTracker() {
  useEffect(() => {
    const trackedWindow = window as TrackedWindow;

    try {
      const navigation = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;

      if (
        window.location.pathname !== '/' ||
        !navigation ||
        new URL(navigation.name).pathname !== '/' ||
        trackedWindow.__homepageVisitTracked
      ) {
        return;
      }
    } catch {
      return;
    }

    trackedWindow.__homepageVisitTracked = true;

    let queued = false;
    try {
      queued = navigator.sendBeacon?.(ENDPOINT, MARKER) ?? false;
    } catch {}

    if (!queued) {
      try {
        void fetch(ENDPOINT, {
          method: 'POST',
          body: MARKER,
          keepalive: true,
        }).catch(() => {});
      } catch {}
    }
  }, []);

  return null;
}
