'use client';

import Image from 'next/image';
import { useState, useSyncExternalStore } from 'react';
import type { HomepageProgressController } from '@/lib/homepage-progress';
import styles from './home-logo-loader.module.css';

export default function HomeLogoLoader({ controller }: { controller: HomepageProgressController }) {
  const [logoReady, setLogoReady] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const { value, phase, slow } = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const status = phase === 'ready' ? 'EMI Guild is ready.' : slow ? 'Taking longer than usual…' : 'Loading EMI Guild…';
  const showPercentage = value > 0 || phase === 'ready';
  return <div className={styles.loader} data-ready={phase === 'ready' ? 'true' : undefined}>
    <div className={styles.artwork}>
      <span className={`${styles.wordmark} ${logoReady ? styles.wordmarkHidden : ''}`} aria-hidden="true">EMI<br />GUILD</span>
      <Image className={`${styles.logo} ${logoReady ? styles.logoReady : ''} ${logoFailed ? styles.logoFailed : ''}`} src="/images/home-loader-logo.webp" alt="" width={560} height={560} unoptimized loading="eager" fetchPriority="high" onLoad={() => { setLogoFailed(false); setLogoReady(true); }} onError={() => { setLogoFailed(true); setLogoReady(false); }} />
      <svg className={styles.ring} viewBox="0 0 100 100" focusable="false" role="progressbar" aria-label="Estimated homepage loading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={showPercentage ? value : undefined} aria-valuetext={showPercentage ? `${value}%, estimated` : undefined}>
        <circle className={styles.track} cx="50" cy="50" r="48" />
        <circle className={styles.fill} cx="50" cy="50" r="48" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - value} />
      </svg>
    </div>
    <div className={styles.percentage} aria-hidden="true">{showPercentage ? <span className={styles.counter}>{value}%</span> : null}</div>
    <p className={styles.status} role="status" aria-live="polite">{status}</p>
  </div>;
}
