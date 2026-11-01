import { vaultLegendaryDisplay, type VaultLegendary } from '@/lib/vault-spin-progress';
import styles from './vault-spin-progress.module.css';

export function VaultSpinProgress({ legendary, epic }: { legendary?: VaultLegendary; epic?: { current: number; target: number } }) {
  const progress = vaultLegendaryDisplay(legendary);
  if (!progress) return null;
  return <div className={styles.progress}>
    <div className={styles.heading}><span>Legendary Guarantee</span><strong>Day {progress.current}/30</strong></div>
    <div className={styles.track} role="progressbar" aria-label="Legendary guarantee" aria-valuemin={0} aria-valuemax={30} aria-valuenow={progress.current} aria-valuetext={`Day ${progress.current} of 30. ${progress.label}`}>
      <span style={{ width: progress.width }} />
    </div>
    <p className={styles.remaining}>{progress.label}</p>
    {epic && <div className={styles.epic}>
      <span>Epic Streak</span>
      <div className={styles.track} role="progressbar" aria-label="Epic streak" aria-valuemin={0} aria-valuemax={epic.target} aria-valuenow={Math.max(0, Math.min(epic.target, epic.current))} aria-valuetext={`Day ${epic.current} of ${epic.target}${epic.current >= epic.target - 1 ? '. Epic on your next eligible spin, unless Legendary is due.' : ''}`}>
        <span style={{ width: `${Math.max(0, Math.min(100, epic.current / Math.max(1, epic.target) * 100))}%` }} />
      </div>
      <span>{epic.current}/{epic.target}</span>
    </div>}
  </div>;
}
