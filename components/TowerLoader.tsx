import styles from './tower-loader.module.css';

export const TOWER_LOADING_DURATION_MS = 8000;

export default function TowerLoader({ complete = false }: { complete?: boolean }) {
  return (
    <div className={styles.loader} role="status" aria-live="polite">
      <svg className={`${styles.tower} ${complete ? styles.complete : ''}`} width="112" height="242" viewBox="0 0 112 242" aria-hidden="true" focusable="false">
        <path className={styles.structure} d="M18 31 56 7 94 31M24 36h64M28 36v192m56-192v192M20 232h72" />
        {Array.from({ length: 10 }, (_, floor) => (
          <g key={floor}>
            <rect className={styles.floorBase} x="34" y={209 - floor * 18} width="44" height="13" rx="2" />
            <rect className={styles.floor} style={{ animationDelay: `${floor * TOWER_LOADING_DURATION_MS / 10}ms` }} x="34" y={209 - floor * 18} width="44" height="13" rx="2" />
            <text className={styles.number} x="56" y={219 - floor * 18}>{floor + 1}</text>
          </g>
        ))}
      </svg>
      <span>Loading Tower…</span>
    </div>
  );
}
