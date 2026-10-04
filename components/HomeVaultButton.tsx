'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import type { AccountState } from '@/lib/lifecycle/rules';
import styles from './home-vault-button.module.css';

function pendingCount(state: AccountState) {
  const now = Date.now();
  const pending = new Set(state.items
    .filter((item) => Date.parse(item.validUntil) > now)
    .map((item) => item.href));

  for (const game of state.games) {
    if (game.deadline && Date.parse(game.deadline.at) <= now) continue;
    const actionable = game.facts?.canClaim
      || (game.id === 'guess36' && game.status === 'available')
      || game.facts?.dailyAvailable
      || (game.id === 'tower' && (game.status === 'active'
        || (game.facts?.tokenExpiries ?? []).some((expiry) => Date.parse(expiry) > now)));
    if (actionable) pending.add(game.href);
  }
  return pending.size;
}

export default function HomeVaultButton() {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/vault', { cache: 'no-store' });
      if (!response.ok) return setCount(0);
      setCount(pendingCount(await response.json()));
    } catch { setCount(0); }
  }, []);

  useEffect(() => {
    void refresh();
    const onReturn = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [refresh]);

  const label = count ? `Vault — ${count} pending ${count === 1 ? 'action' : 'actions'}` : 'Vault — rewards and game progress';
  return <Link href="/vault" className={styles.button} aria-label={label} title={label}>
    <Bell size={14} aria-hidden="true" />
    {count > 0 && <span className={styles.badge} aria-hidden="true">{count > 9 ? '9+' : count}</span>}
  </Link>;
}
