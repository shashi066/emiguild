import styles from './armory-loader.module.css';

export const ARMORY_LOADING_DURATION_MS = 8000;

export default function ArmoryLoader({ complete = false }: { complete?: boolean }) {
  return <div className={`${styles.loader} ${complete ? styles.complete : ''}`}>
    <svg className={styles.forge} width="300" height="280" viewBox="0 0 300 280" aria-hidden="true" focusable="false">
      <path className={styles.structure} d="M36 236V62l26-26h176l26 26v174H36zM48 236h204v12H48z" />
      <path className={styles.structure} d="M88 190h124l-20 20h-24v16h18v10h-72v-10h18v-16h-24z" />
      <g className={`${styles.stage} ${styles.frame}`}>
        <path d="M36 170V62l26-26h176l26 26v108M48 248h204M88 190h124l-20 20h-24v16h18v10h-72v-10h18v-16h-24z" />
      </g>
      <g className={`${styles.stage} ${styles.energy}`}>
        <path d="M48 170h24l26-26h22M252 170h-24l-26-26h-22M150 48v34" />
        <circle cx="48" cy="170" r="4" /><circle cx="252" cy="170" r="4" />
      </g>
      <g className={`${styles.stage} ${styles.artifact}`}>
        <path className={styles.left} d="m150 88-30 18v39l30 25v-29l-13-12 13-15z" />
        <path className={styles.right} d="m150 88 30 18v39l-30 25v-29l13-12-13-15z" />
      </g>
      <g className={`${styles.stage} ${styles.finish}`}>
        <path d="m150 88 30 18v39l-30 25-30-25v-39zM150 114l13 15-13 12-13-12zM110 78h-8v12m88-12h8v12m-96 68v12h8m88-12v12h-8" />
      </g>
    </svg>
    <p className={styles.caption} role="status" aria-live="polite">Preparing your Armory…</p>
  </div>;
}
