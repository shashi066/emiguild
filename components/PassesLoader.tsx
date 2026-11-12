'use client';

import type { CSSProperties } from 'react';
import { useIntroComplete } from './TimedIntroBoundary';
import styles from './passes-loader.module.css';

export const PASSES_LOADING_DURATION_MS = 1500;
const TIERS = [
  { name: 'Bronze', color: '#d08a47', angle: -24 },
  { name: 'Silver', color: '#cbd5e1', angle: -12 },
  { name: 'Gold', color: '#facc15', angle: 0 },
  { name: 'Black', color: '#d8dee9', angle: 12 },
  { name: 'Apex', color: '#a78bfa', angle: 24 },
];
// Each card takes 300 ms; 240 ms apart, the full hand lands at ~1.26 s and holds until the reveal.
const STEP_MS = 240;

export default function PassesLoader({ complete = false }: { complete?: boolean }) {
  return <div className={`${styles.loader} ${complete ? styles.complete : ''}`}>
    <svg className={styles.fan} width="300" height="240" viewBox="0 0 300 240" aria-hidden="true" focusable="false">
      {TIERS.map((tier, index) => (
        <g key={tier.name} transform={`rotate(${tier.angle} 150 228)`}>
          <g
            className={`${styles.card} ${index === TIERS.length - 1 ? styles.apex : ''}`}
            style={{ '--tier': tier.color, animationDelay: `${index * STEP_MS}ms` } as CSSProperties}
          >
            <rect className={styles.face} x="108" y="62" width="84" height="124" rx="10" />
            <path className={styles.stripe} d="M108 92h84" />
            <path className={styles.emblem} d="m150 112 7 13 14 2-10 10 2 14-13-7-13 7 2-14-10-10 14-2z" />
            <path className={styles.hours} d="M124 168h52M132 176h36" />
          </g>
        </g>
      ))}
    </svg>
    <p className={styles.caption} role="status" aria-live="polite">Loading passes…</p>
  </div>;
}

export function PassesRouteLoader() {
  return <PassesLoader complete={useIntroComplete()} />;
}
