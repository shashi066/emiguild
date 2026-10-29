'use client';

import { AdminModalShell } from '@/components/admin/AdminModalShell';
import { SpinPresentation } from './SpinPresentation';
import { ForgeReveal } from './ForgeReveal';
import { VaultSpinProgress } from './VaultSpinProgress';
import type { VaultDailyActionState } from './useVaultDailyAction';
import styles from './vault-daily-action.module.css';

export function VaultDailyActionModal({ action, close, retry }: { action: VaultDailyActionState; close: () => void; retry: () => void }) {
  return <div data-kind={action.kind} className={`${styles.root} ${action.closing ? styles.closing : ''}`}>
    <AdminModalShell onClose={close} labelledBy="vault-daily-title" describedBy="vault-daily-status" lightweight>
      <div className={styles.header}><h2 id="vault-daily-title" className={styles.title}>{action.kind === 'spin' ? 'Guild Spin' : 'Daily Forge'}</h2><button type="button" className={styles.dismiss} aria-label="Close reward popup" disabled={action.busy || action.closing} onClick={close}>×</button></div>
      <p id="vault-daily-status" className={styles.status} role="status">
        {action.busy ? 'Confirming your reward…' : action.result ? 'Your reward is saved to your account.' : 'Your game status is shown below.'}
      </p>
      {action.error && <div className={styles.error} role="alert"><p>{action.error}</p><button type="button" onClick={retry}>{action.uncertain ? 'Check status' : 'Try again'}</button></div>}
      {!action.error && action.kind === 'spin' && !action.items.length && action.busy && <p className={styles.preparing}>Preparing your reward grid…</p>}
      {!action.error && action.kind === 'spin' && (action.items.length > 0 || action.result) && <SpinPresentation gridItems={action.items} highlighted={action.highlighted} spinning={action.busy} reward={action.result?.reward ?? null} streakReward={action.result?.streakReward} />}
      {!action.error && action.kind === 'forge' && <ForgeReveal artifact={action.result?.selected ?? null} saving={action.busy} embedded />}
      {action.kind === 'spin' && action.result?.legendary?.enabled ? <VaultSpinProgress legendary={action.result.legendary} epic={action.result.streak} /> : action.result?.streak && <p className={styles.status}>Streak: {action.result.streak.current} of {action.result.streak.target} days</p>}
      {action.busy && <p className={styles.note}>Leaving this page won’t cancel a submitted action.</p>}
      <button className={styles.close} type="button" disabled={action.busy || action.closing} onClick={close}>{action.busy ? 'Processing…' : 'Back to Vault'}</button>
    </AdminModalShell>
  </div>;
}
