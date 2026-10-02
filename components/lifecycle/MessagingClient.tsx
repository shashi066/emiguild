'use client';
import { useEffect, useState } from 'react';
import { MessagingSettings } from '@/lib/lifecycle/rules';
import { LifecyclePreviewClient } from './LifecyclePreviewClient';
import styles from './lifecycle.module.css';
export function MessagingClient() {
  const [tab, setTab] = useState<'settings' | 'preview'>('settings');
  const [settings, setSettings] = useState<MessagingSettings | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setError('');
    try {
      const response = await fetch('/api/admin/lifecycle/settings', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      setSettings(await response.json());
    } catch { setError('Email settings could not be loaded.'); }
  }
  useEffect(() => { void load(); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/lifecycle/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      if (!response.ok) throw new Error();
      setSettings(await response.json()); setMessage('Email settings saved.');
    } catch { setError('Settings could not be saved. Please try again.'); }
    finally { setBusy(false); }
  }
  async function testEmail() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/lifecycle/test-email', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Test email was not accepted. Check delivery history.');
      setMessage('Gmail accepted the test email for ' + body.recipient + '.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Test email failed.'); }
    finally { setBusy(false); }
  }
  return <div className={styles.shell}>
    <p className={styles.kicker}>Admin controls</p><h1 className="page-title">Messaging</h1>
    <p className={styles.muted}>Useful emails from each player’s account. Both campaigns share a limit of one email every seven days.</p>
    <div role="tablist" aria-label="Messaging" className={styles.actions} style={{ marginTop: 24 }}>
      {(['settings', 'preview'] as const).map((item) => <button key={item} id={'messaging-' + item + '-tab'} role="tab" aria-selected={tab === item} aria-controls={'messaging-' + item + '-panel'} className={'btn ' + (tab === item ? 'btn-primary' : 'btn-secondary')} onClick={() => setTab(item)}>{item === 'settings' ? 'Settings' : 'Player Preview'}</button>)}
    </div>
    {tab === 'settings' ? <section role="tabpanel" id="messaging-settings-panel" aria-labelledby="messaging-settings-tab" className={'card ' + styles.panel}>
      <h2>Email campaigns</h2>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!settings ? error ? <button className="btn btn-secondary" onClick={load}>Try again</button> : <p role="status">Loading settings…</p> : <>
        <form className={styles.field} onSubmit={save}>
          <label className={styles.check}><input type="checkbox" disabled={busy} checked={settings.emailDigest} onChange={(event) => setSettings({ ...settings, emailDigest: event.target.checked })} /><span><strong>Weekly Vault digest</strong><br />A roundup of current rewards and opportunities, targeting Sunday at 6pm.</span></label>
          <label className={styles.check}><input type="checkbox" disabled={busy} checked={settings.comebackEmail} onChange={(event) => setSettings({ ...settings, comebackEmail: event.target.checked })} /><span><strong>Three-day comeback email</strong><br />Check every three days. Invite a player back only if they skipped Spin, Forge, and Guess 36 throughout the last 72 hours.</span></label>
          <p className={styles.muted}>Uses registered email addresses. Playing any of the three games prevents the comeback email. A website visit pauses both emails for 72 hours, and unsubscribed players receive neither.</p>
          <p className={styles.time}>The daily check runs around 6pm India time. Production delivery must be configured and enabled before any email is sent.</p>
          <div className={styles.actions}><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={testEmail}>Send test to my email</button></div>
        </form><p role="status">{message}</p>
      </>}
    </section> : <section role="tabpanel" id="messaging-preview-panel" aria-labelledby="messaging-preview-tab"><LifecyclePreviewClient /></section>}
  </div>;
}
