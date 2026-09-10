'use client';

import { Info } from 'lucide-react';

type InfoGuideButtonProps = {
  ariaLabel: string;
  onClick: () => void;
  label?: string;
};

export function InfoGuideButton({ ariaLabel, onClick, label = 'Info' }: InfoGuideButtonProps) {
  return (
    <>
      <button
        type="button"
        className="info-guide-trigger"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
      >
        <Info size={16} aria-hidden="true" />
        {label}
      </button>
      <style jsx>{`
        .info-guide-trigger {
          min-width: 62px;
          min-height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          flex: 0 0 auto;
          padding: 0 8px;
          border: 1px solid rgba(97, 232, 255, 0.3);
          border-radius: 6px;
          background: #111b2a;
          color: #61e8ff;
          font: inherit;
          font-size: 0.7rem;
          font-weight: 800;
          cursor: pointer;
        }
        .info-guide-trigger:hover { background: #142435; }
        .info-guide-trigger:focus-visible { outline: 2px solid #61e8ff; outline-offset: 2px; }
      `}</style>
    </>
  );
}

export default InfoGuideButton;
