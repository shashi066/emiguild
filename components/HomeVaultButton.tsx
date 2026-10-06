'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Bell } from 'lucide-react';
import { createVaultReader } from '@/lib/vault-client';
import styles from './home-vault-button.module.css';

export default function HomeVaultButton() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const reader = useMemo(() => userId ? createVaultReader<{ pendingCount: number }>('/api/vault/summary') : null, [userId]);
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    setCount(0);
    if (!reader) return;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try { const data = await reader(); if (active) setCount(data.pendingCount); } catch { /* Keep the last known badge on transient failures. */ }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [reader, userId]);
  const label = count ? `Vault — ${count} pending ${count === 1 ? 'action' : 'actions'}` : 'Vault — rewards and game progress';
  return <Link href="/vault" className={styles.button} aria-label={label} title={label}>
    <Bell size={14} aria-hidden="true" />
    {count > 0 && <span className={styles.badge} aria-hidden="true">{count > 9 ? '9+' : count}</span>}
  </Link>;
}
