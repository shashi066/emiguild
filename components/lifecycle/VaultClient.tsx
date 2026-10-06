'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { createVaultReader } from '@/lib/vault-client';
import { AccountState } from '@/lib/lifecycle/rules';
import { VaultDashboard } from './VaultDashboard';

export function VaultClient() {
  const { data: session } = useSession();
  const reader = useMemo(() => session?.user?.id ? createVaultReader<AccountState>('/api/vault') : null, [session?.user?.id]);
  const [state, setState] = useState<AccountState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef({ value: 0 });
  const refresh = useCallback(async (force = true) => {
    if (!reader) { setLoading(false); return; }
    const id = ++requestId.current.value;
    setNow(Date.now());
    setLoading(true);
    setError('');
    try {
      const body = await reader(force);
      if (id === requestId.current.value) setState(body);
    } catch (cause) {
      if (id === requestId.current.value) { setState(null); setError(cause instanceof Error ? cause.message : 'Please try again.'); }
    } finally { if (id === requestId.current.value) setLoading(false); }
  }, [reader]);
  useEffect(() => {
    const requests = requestId.current;
    setState(null);
    void refresh(false);
    const onReturn = () => { if (document.visibilityState === 'visible') void refresh(false); };
    window.addEventListener('focus', onReturn);
    window.addEventListener('pageshow', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    const timer = window.setInterval(onReturn, 60_000);
    return () => { requests.value++; window.clearInterval(timer); window.removeEventListener('focus', onReturn); window.removeEventListener('pageshow', onReturn); document.removeEventListener('visibilitychange', onReturn); };
  }, [refresh]);
  useEffect(() => {
    if (!state) return;
    const deadlines = [
      ...state.items.map((item) => Date.parse(item.validUntil)),
      ...state.games.flatMap((game) => [
        ...(game.deadline ? [Date.parse(game.deadline.at)] : []),
        ...(game.facts?.tokenExpiries ?? []).map(Date.parse),
        ...(game.facts?.events ?? []).flatMap((event) => event.at ? [Date.parse(event.at)] : []),
      ]),
    ];
    const future = deadlines.filter((value) => value > Date.now());
    if (!future.length) return;
    const next = Math.min(...future);
    const timer = window.setTimeout(refresh, Math.min(2_147_483_647, Math.max(1000, next - Date.now() + 100)));
    return () => window.clearTimeout(timer);
  }, [state, refresh, now]);
  return <VaultDashboard now={new Date(now)} state={state} loading={loading} error={error} refresh={() => void refresh(true)} />;
}
