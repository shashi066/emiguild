import { Gift } from 'lucide-react';
import styles from './guild-spin-loader.module.css';

export const GUILD_SPIN_LOADING_DURATION_MS = 8000;
const TILE_DURATION_MS = GUILD_SPIN_LOADING_DURATION_MS / 9;

export default function GuildSpinLoader({ complete = false }: { complete?: boolean }) {
  return (
    <div className={styles.loader} role="status" aria-live="polite">
      <div className={`${styles.grid} ${complete ? styles.complete : ''}`} aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <div className={styles.tile} key={index}>
            <span
              className={styles.highlight}
              style={{ animationDelay: `${index * TILE_DURATION_MS}ms`, animationDuration: `${TILE_DURATION_MS}ms` }}
            />
            <Gift size={24} className={styles.gift} />
          </div>
        ))}
      </div>
      <span>Loading Guild Spin…</span>
    </div>
  );
}
