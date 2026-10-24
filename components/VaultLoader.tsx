'use client';

import { useId } from 'react';
import styles from './vault-loader.module.css';

export const VAULT_LOADING_DURATION_MS = 8000;
const stages = ['Powering up…', 'Unlocking…', 'Opening vault…', 'Preparing your inventory…'];

export default function VaultLoader({ complete = false, compact = false }: { complete?: boolean; compact?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={`${styles.loader} ${compact ? styles.compact : ''} ${complete ? styles.complete : ''}`}>
      <span className={styles.srOnly} role="status" aria-live="polite">Opening your Vault…</span>
      <svg className={styles.safe} width="320" height="300" viewBox="0 0 320 300" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={`${id}-opening`}><path d="M62 40h196l16 16v188l-16 16H62l-16-16V56z" /></clipPath>
          <clipPath id={`${id}-left`}><rect x="40" y="34" width="120" height="232" /></clipPath>
          <clipPath id={`${id}-right`}><rect x="160" y="34" width="120" height="232" /></clipPath>
          <linearGradient id={`${id}-metal`} x2="1" y2="1"><stop stopColor="#27384a" /><stop offset=".5" stopColor="#111c2b" /><stop offset="1" stopColor="#1b2e3e" /></linearGradient>
          <radialGradient id={`${id}-light`}><stop stopColor="#00d4ff" stopOpacity=".28" /><stop offset="1" stopColor="#00d4ff" stopOpacity="0" /></radialGradient>
        </defs>
        <path className={styles.frame} d="M42 16h236l24 24v220l-24 24H42l-24-24V40z" />
        <path className={styles.trim} d="M52 29h216l21 21v200l-21 21H52l-21-21V50z" />
        <g clipPath={`url(#${id}-opening)`}>
          <rect x="46" y="40" width="228" height="220" fill="#070d16" />
          <g className={styles.loot}>
            <rect x="46" y="40" width="228" height="220" fill={`url(#${id}-light)`} stroke="none" />
            <path className={styles.inventoryLines} d="M68 90h184M68 210h184M106 90v120m108-120v120" />
            <g className={styles.icons}>
              <circle cx="88" cy="150" r="16" /><path d="m88 140 7 10-7 10-7-10z" />
              <path d="m160 116 28 14v39l-28 18-28-18v-39zM160 127v47m-17-37 17-10 17 10" />
              <path d="M216 143h32v10h-32zM220 153v20h24v-20M232 143v30m0-30c-18 0-13-20-5-10l5 10c18 0 13-20 5-10z" />
            </g>
          </g>
          {['left', 'right'].map(side => (
            <g key={side} className={side === 'left' ? styles.leftDoor : styles.rightDoor}>
              <g clipPath={`url(#${id}-${side})`}>
                <rect x="46" y="40" width="228" height="220" fill={`url(#${id}-metal)`} />
                <path className={styles.panel} d="M58 58h82v184H58zM180 58h82v184h-82z" />
                <path className={styles.seam} d="M160 40v220M62 76h22m152 0h22M62 224h22m152 0h22" />
                <g className={styles.lock}>
                  <circle cx="160" cy="150" r="38" fill="#0b1420" />
                  <circle cx="160" cy="150" r="27" className={styles.lockRing} />
                  <path className={styles.lockRing} d="M160 121v17m0 24v17m-29-29h17m24 0h17" />
                  <path d="m160 140 10 10-10 10-10-10z" fill="#00d4ff" />
                </g>
              </g>
              <g className={side === 'left' ? styles.leftBolts : styles.rightBolts}>
                <path className={styles.bolt} d={side === 'left' ? 'M148 88h12m-12 124h12' : 'M160 88h12m-12 124h12'} />
              </g>
            </g>
          ))}
        </g>
        <path className={styles.lights} d="M62 23h72m52 0h72M25 64v68m0 36v68m270-172v68m0 36v68M62 277h72m52 0h72" />
        {[40, 280].flatMap(x => [42, 258].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" className={styles.rivet} />))}
      </svg>
      <div className={styles.caption} aria-hidden="true">
        <div className={styles.title}>Your Vault</div>
        <div className={styles.status}>
          {stages.map((stage, index) => <span key={stage} className={styles.stage} style={{ animationDelay: `${index * 2000}ms` }}>{stage}</span>)}
          <span className={styles.waiting}>Loading your inventory…</span>
        </div>
      </div>
    </div>
  );
}
