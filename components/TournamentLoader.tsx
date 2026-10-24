import styles from './tournament-loader.module.css';

export const TOURNAMENT_LOADING_MS = 8000;

export default function TournamentLoader({ complete = false }: { complete?: boolean }) {
  return <div className={styles.loader} role="status" aria-live="polite">
    <svg className={`${styles.bracket} ${complete ? styles.complete : ''}`} viewBox="0 0 300 240" width="300" height="240" aria-hidden="true" focusable="false">
      <g className={styles.stage} style={{ animationDelay: '0ms' }}>
        {Array.from({ length: 8 }, (_, i) => <rect key={i} x="8" y={8 + i * 28} width="48" height="18" rx="4" />)}
        {[0, 1, 2, 3].map(i => <path key={i} d={`M56 ${17+i*56}h20v28H56M76 ${31+i*56}h24`} />)}
      </g>
      <g className={styles.stage} style={{ animationDelay: '2000ms' }}>
        {[0, 1, 2, 3].map(i => <rect key={i} x="100" y={22+i*56} width="40" height="18" rx="4" />)}
        {[0, 1].map(i => <path key={i} d={`M140 ${31+i*112}h18v56h-18M158 ${59+i*112}h20`} />)}
      </g>
      <g className={styles.stage} style={{ animationDelay: '4000ms' }}>
        {[0, 1].map(i => <rect key={i} x="178" y={50+i*112} width="36" height="18" rx="4" />)}
        <path d="M214 59h16v112h-16M230 115h14" />
      </g>
      <g className={styles.stage} style={{ animationDelay: '6000ms' }}>
        <path d="M254 96h26v17c0 18-26 18-26 0zM254 100h-7v9q0 9 9 9M280 100h7v9q0 9-9 9M267 127v13m-11 0h22" />
      </g>
    </svg>
    <span>Loading tournaments…</span>
  </div>;
}
