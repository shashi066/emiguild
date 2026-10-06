'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ACTIVITY_THROTTLE_MS } from '@/lib/lifecycle/rules';

export function ActivityTracker() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const last = useRef({ userId: '', at: 0 });
  useEffect(() => {
    const userId = session?.user?.id;
    // Admin previews must not alter activity or eligibility for any account.
    if (!userId || pathname.startsWith('/admin')) return;
    let cancelled = false;
    const record = async () => {
      if (document.visibilityState !== 'visible') return;
      if (last.current.userId === userId && Date.now() - last.current.at < ACTIVITY_THROTTLE_MS) return;
      const previous = last.current;
      last.current = { userId, at: Date.now() };
      try {
        const response = await fetch('/api/activity', { method: 'POST' });
        if (!response.ok && !cancelled) last.current = previous;
      } catch { if (!cancelled) last.current = previous; }
    };
    void record();
    window.addEventListener('focus', record);
    document.addEventListener('visibilitychange', record);
    const timer = window.setInterval(record, ACTIVITY_THROTTLE_MS);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', record); document.removeEventListener('visibilitychange', record); };
  }, [pathname, session?.user?.id]);
  return null;
}
