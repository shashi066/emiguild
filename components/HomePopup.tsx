'use client';

import { useEffect, useId, useState } from 'react';
import { ExternalLink, MessageCircle, X } from 'lucide-react';
import { AdminModalShell } from '@/components/admin/AdminModalShell';
import { useHomeRevealed } from '@/components/HomeLoadingBoundary';
import { popupActionHref, type HomePopupConfig } from '@/lib/home-popup';
import { formatCurrency } from '@/lib/utils';
import styles from './home-popup.module.css';

// Gives the home loader's 350 ms fade time to finish before the popup scales in.
const OPEN_DELAY_MS = 400;

export default function HomePopup({ config }: { config: HomePopupConfig }) {
  const revealed = useHomeRevealed();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    if (!config.enabled || !revealed || dismissed) {
      setOpen(false);
      return;
    }
    const timer = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [config.enabled, revealed, dismissed]);

  if (!config.enabled || !revealed || !open || dismissed) return null;
  const close = () => { setDismissed(true); setOpen(false); };

  return <AdminModalShell onClose={close} labelledBy={titleId} describedBy={config.subtitle ? subtitleId : undefined} lightweight dialogClassName={styles.dialog}>
    <HomePopupCard config={config} titleId={titleId} subtitleId={subtitleId} onClose={close} />
  </AdminModalShell>;
}

export function HomePopupCard({ config, titleId, subtitleId, onClose, preview = false }: {
  config: HomePopupConfig;
  titleId?: string;
  subtitleId?: string;
  onClose?: () => void;
  preview?: boolean;
}) {
  const href = popupActionHref(config);
  return <div className={`${styles.card} ${preview ? styles.preview : ''}`}>
    {onClose && <button type="button" className={styles.close} onClick={onClose} aria-label="Close announcement"><X size={18} /></button>}
    {config.eyebrow && <span className={styles.eyebrow}><span className={styles.dot} aria-hidden="true" />{config.eyebrow}</span>}
    <h2 id={titleId} className={styles.title}>{config.title}</h2>
    {config.subtitle && <p id={subtitleId} className={styles.subtitle}>{config.subtitle}</p>}
    {config.prices.length > 0 && <ul className={styles.prices} data-wide-prices={config.prices.some(price => price.amount >= 1000) || undefined} aria-label="Prices">
      {config.prices.map((price, index) => <li key={`${price.label}-${index}`} className={styles.price}>
        <span className={styles.priceLabel}>{price.label}</span>
        <strong className={styles.priceAmount}>{formatCurrency(price.amount)}</strong>
      </li>)}
    </ul>}
    {config.note && <p className={styles.note}>{config.note}</p>}
    {href && <a
      className={`${styles.action} ${config.actionType === 'link' ? styles.linkAction : ''}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={preview ? -1 : undefined}
    >
      {config.actionType === 'link' ? <ExternalLink size={18} aria-hidden="true" /> : <MessageCircle size={18} aria-hidden="true" />}
      {config.buttonLabel}
    </a>}
  </div>;
}
