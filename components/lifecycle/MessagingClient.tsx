'use client';

import { useEffect, useState } from 'react';
import type { MessagingSettings } from '@/lib/lifecycle/rules';
import styles from './lifecycle.module.css';

export function MessagingClient() {
  const [settings, setSettings] = useState<MessagingSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void fetch('/api/admin/lifecycle/settings', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not load mail settings.');
        setSettings(data);
      }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load mail settings.'); });
    return () => controller.abort();
  }, [attempt]);

  async function submit(test: boolean) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/lifecycle/' + (test ? 'test-email' : 'settings'), {
        method: test ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
        ...(test ? {} : { body: JSON.stringify(settings) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not complete the request. An email may have been dispatched; do not retry immediately.');
      if (!test) setSettings(data);
      setMessage(test ? 'Test email accepted for ' + data.recipient + '.' : 'Mail settings saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Request failed.'); }
    finally { setBusy(false); }
  }

  return <div className={styles.shell}>
    <header><p className={styles.kicker}>Admin controls</p><h1>Messaging / Mail</h1><p className={styles.muted}>Useful emails for players. Both campaigns share a limit of one email every seven days.</p></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!settings ? (error ? <button className="btn btn-secondary" onClick={() => setAttempt((value) => value + 1)}>Retry loading</button> : <p role="status">Loading mail settings…</p>) :
      <form className={'card ' + styles.panel} onSubmit={(event) => { event.preventDefault(); void submit(false); }}>
        <label className={styles.check}><input type="checkbox" checked={settings.emailDigest} disabled={busy} onChange={(event) => setSettings({ ...settings, emailDigest: event.target.checked })} /><span><strong>Weekly Vault digest</strong><br />A roundup of available rewards and opportunities, targeting Sunday evening.</span></label>
        <label className={styles.check}><input type="checkbox" checked={settings.comebackEmail} disabled={busy} onChange={(event) => setSettings({ ...settings, comebackEmail: event.target.checked })} /><span><strong>Three-day comeback email</strong><br />A reminder when a player has skipped Spin, Forge and Guess 36 for 72 hours.</span></label>
        <p className={styles.muted}>Website visits pause both campaigns for 72 hours. Unsubscribed players receive neither. Checks run daily around 6 PM IST; delivery requires production Gmail configuration and the authenticated schedule.</p>
        <div className={styles.actions}><button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Working…' : 'Save settings'}</button><button className="btn btn-secondary" disabled={busy} type="button" onClick={() => void submit(true)}>Send test to my email</button></div>
        <small className={styles.muted}>Test emails go only to your admin email, with a maximum of three per day.</small>
      </form>}
  </div>;
}
