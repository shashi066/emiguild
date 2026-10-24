'use client';

import { useEffect, useRef, useState } from 'react';
import { animateDailySpin, waitForRewardReveal, DailyRewardError, executeDailyReward, type DailyRewardData, type DailyRewardKind } from '@/lib/daily-reward-client';

export type VaultDailyActionState = {
  kind: DailyRewardKind; busy: boolean; items: any[]; highlighted: number | null;
  result: DailyRewardData | null; error: string; uncertain: boolean; closing?: boolean;
};

export function useVaultDailyAction(ownerId: string | undefined, onCommitted: () => void) {
  const [action, setAction] = useState<VaultDailyActionState | null>(null);
  const active = useRef(false);
  const busy = useRef(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const closingRef = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; abortRef.current?.abort(); clearTimeout(closeTimer.current); };
  }, []);
  useEffect(() => {
    clearTimeout(closeTimer.current); closingRef.current = false;
    abortRef.current?.abort(); active.current = false; busy.current = false; setAction(null);
  }, [ownerId]);

  const start = (kind: DailyRewardKind, recheck = false) => {
    if (!ownerId || (active.current && !recheck)) return;
    if (closingRef.current || busy.current) return;
    if (!recheck) previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    active.current = true;
    busy.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    const valid = () => alive.current && !controller.signal.aborted;
    const update = (patch: Partial<VaultDailyActionState>) => {
      if (valid()) setAction(current => current ? { ...current, ...patch } : current);
    };
    setAction({ kind, busy: true, items: [], highlighted: null, result: null, error: '', uncertain: false });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let animation: Promise<DailyRewardData> | undefined;
    let forgeStarted = performance.now();
    const operation = executeDailyReward(kind, ownerId, { prepared: state => {
      forgeStarted = performance.now();
      if (kind === 'spin') {
        const raw = state.lootItems ?? [];
        if (!raw.length) return;
        const count = Math.max(3, Math.ceil(raw.length / 3) * 3);
        const items = Array.from({ length: count }, (_, i) => raw[i % raw.length]);
        update({ items });
        animation = animateDailySpin(items, operation as Promise<DailyRewardData & { reward: { id: string } }>,
          highlighted => update({ highlighted }), controller.signal, reduced);
        void animation.catch(() => undefined);
      }
    } });
    void (async () => {
      try {
        const result = await operation;
        if (!valid()) return;
        onCommitted();
        if (animation) await animation;
        if (kind === 'forge' && !reduced) {
          await waitForRewardReveal(Math.max(0, 3000 - (performance.now() - forgeStarted)), controller.signal);
        }
        if (valid()) busy.current = false;
        update({ result, busy: false });
      } catch (cause) {
        if (valid()) { busy.current = false; onCommitted(); }
        update({ busy: false, highlighted: null, error: cause instanceof Error ? cause.message : 'Please try again.', uncertain: cause instanceof DailyRewardError && cause.uncertain });
      }
    })();
  };
  const close = () => {
    if (action?.busy || closingRef.current) return;
    closingRef.current = true;
    setAction(current => current ? { ...current, closing: true } : current);
    const finish = () => {
      abortRef.current?.abort(); active.current = false; closingRef.current = false; setAction(null);
      requestAnimationFrame(() => {
        if (!alive.current) return;
        const target = previousFocus.current?.isConnected ? previousFocus.current : document.getElementById('vault-heading');
        target?.focus({ preventScroll: true });
      });
    };
    closeTimer.current = setTimeout(finish, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140);
  };
  return { action, start, close };
}
