import styles from './guess36-loader.module.css';

export const GUESS36_LOADING_DURATION_MS = 8000;

export default function Guess36Loader({ complete = false }: { complete?: boolean }) {
  return <div className={`${styles.loader} ${complete ? styles.complete : ''}`}>
    <svg className={styles.illustration} viewBox="0 0 300 280" width="300" height="280" aria-hidden="true" focusable="false">
      <path className={styles.frame} d="M46 20h208l16 16v136l-16 16H46l-16-16V36z" />
      {['03', '06', '12', '18', '24', '36'].map((number, i) => <g key={number} className={styles.tile} style={{ '--tile': i } as React.CSSProperties}>
        <rect x={51 + i % 3 * 68} y={40 + Math.floor(i / 3) * 64} width="62" height="56" rx="8" />
        <rect className={styles.scan} x={51 + i % 3 * 68} y={40 + Math.floor(i / 3) * 64} width="62" height="56" rx="8" />
        <text x={82 + i % 3 * 68} y={75 + Math.floor(i / 3) * 64} textAnchor="middle">{number}</text>
      </g>)}
      <g className={styles.ticket}>
        <path d="M84 155h132v25a9 9 0 0 0 0 18v44H84v-44a9 9 0 0 0 0-18z" />
        <path className={styles.perforation} d="M96 215h108" />
        <text x="150" y="174" textAnchor="middle" className={styles.ticketLabel}>GUESS</text>
        <text x="150" y="207" textAnchor="middle" className={styles.brandNumber}>36</text>
        <path className={styles.ticketLines} d="M101 228h24m8 0h10" />
      </g>
      <g className={styles.lock}>
        <path className={styles.shackle} d="M182 218v-10a9 9 0 0 1 18 0v10" />
        <rect x="176" y="216" width="30" height="24" rx="5" />
        <path className={styles.keyhole} d="M191 224v7" />
      </g>
      <path className={styles.sealed} d="m226 224 6 6 12-14" />
    </svg>
    <p className={styles.caption} role="status" aria-live="polite">Loading Guess 36…</p>
  </div>;
}
