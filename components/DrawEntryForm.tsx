'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function DrawEntryForm({ drawId }: { drawId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function enter() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/draws/${drawId}/entries`, { method: 'POST' });
      const data = await res.json();

      // If the server indicates authentication is required, redirect to login (same as slot booking flow)
      if (res.status === 401) {
        const redirectTo = pathname || '/draws';
        router.push(`/login?redirect=${encodeURIComponent(redirectTo)}`);
        return;
      }

      if (!res.ok) throw new Error(data?.error || 'Failed');
      setMessage('Entered successfully!');
    } catch (err: any) {
      setMessage(err.message || 'Failed to enter');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={enter} className="btn" disabled={loading}>{loading ? 'Entering...' : 'Enter Draw'}</button>
      {message && <div style={{ marginTop: 8 }}>{message}</div>}
    </div>
  );
}
