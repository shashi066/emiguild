'use client';

import { useIntroComplete } from './TimedIntroBoundary';
import styles from './games-loader.module.css';

export const GAMES_LOADING_DURATION_MS = 1500;
// Seven game spines drop into the cabinet 130 ms apart (300 ms each); the cabinet is complete by
// ~1.1 s and holds until the reveal.
const STEP_MS = 130;
const SHELF_Y = 192;
const SPINE_HEIGHTS = [102, 88, 112, 82, 106, 94, 100];

export default function GamesLoader({ complete = false }: { complete?: boolean }) {
  return <div className={`${styles.loader} ${complete ? styles.complete : ''}`}>
    <svg className={styles.cabinet} width="300" height="240" viewBox="0 0 300 240" aria-hidden="true" focusable="false">
      <path className={styles.structure} d="M36 200V62l18-18h192l18 18v138zM48 200h204v10H48z" />
      <path className={styles.structure} d="M48 72h204" />
      {SPINE_HEIGHTS.map((height, index) => {
        const x = 59 + index * 26;
        const y = SHELF_Y - height;
        return <g key={x} className={styles.spine} style={{ animationDelay: `${index * STEP_MS}ms` }}>
          <rect x={x} y={y} width="18" height={height} rx="3" />
          <path d={`M${x + 5} ${y + 10}h8M${x + 5} ${SHELF_Y - 12}h8`} />
        </g>;
      })}
    </svg>
    <p className={styles.caption} role="status" aria-live="polite">Loading game library…</p>
  </div>;
}

export function GamesRouteLoader() {
  return <GamesLoader complete={useIntroComplete()} />;
}
