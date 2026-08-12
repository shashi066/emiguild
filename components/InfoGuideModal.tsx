'use client';

import { Info, X } from 'lucide-react';
import { AdminModalShell } from '@/components/admin/AdminModalShell';

export type InfoGuideStep = {
  title: string;
  description: string;
};

export type InfoGuideModalProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  titleId: string;
  steps: readonly InfoGuideStep[];
  onClose: () => void;
  closeLabel?: string;
};

export function InfoGuideModal({
  eyebrow,
  title,
  subtitle,
  titleId,
  steps,
  onClose,
  closeLabel = `Close ${eyebrow}`,
}: InfoGuideModalProps) {
  const subtitleId = `${titleId}-subtitle`;

  return (
    <AdminModalShell onClose={onClose} labelledBy={titleId} describedBy={subtitleId}>
      <section className="info-guide-modal">
        <header className="info-guide-header">
          <span className="info-guide-icon" aria-hidden="true">
            <Info size={22} />
          </span>
          <div className="info-guide-heading">
            <span>{eyebrow}</span>
            <h2 id={titleId}>{title}</h2>
            <p id={subtitleId}>{subtitle}</p>
          </div>
          <button
            type="button"
            className="info-guide-close"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>

        <ol className="info-guide-steps" role="list">
          {steps.map((step, index) => (
            <li key={`${index}-${step.title}`}>
              <span className="info-guide-step-number" aria-hidden="true">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <span>{step.description}</span>
              </div>
            </li>
          ))}
        </ol>

        <div className="info-guide-actions">
          <button type="button" className="info-guide-confirm" onClick={onClose}>Got It</button>
        </div>
      </section>

      <style jsx>{`
        .info-guide-modal {
          min-width: 0;
          display: grid;
          gap: 16px;
          color: var(--color-text-primary);
          overflow-wrap: anywhere;
        }

        .info-guide-header {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: start;
          gap: 12px;
        }

        .info-guide-heading {
          min-width: 0;
          display: grid;
          gap: 3px;
        }

        .info-guide-icon {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border: 1px solid rgba(97, 232, 255, 0.3);
          border-radius: 50%;
          background: rgba(97, 232, 255, 0.08);
          color: #61e8ff;
        }

        .info-guide-heading > span {
          color: #61e8ff;
          font-size: 0.7rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .info-guide-heading h2 {
          margin: 0;
          font-family: var(--font-orbitron);
          font-size: 1.25rem;
          line-height: 1.2;
        }

        .info-guide-heading p {
          margin: 0;
          color: var(--color-text-secondary);
          font-size: 0.86rem;
        }

        .info-guide-close {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: var(--color-text-muted);
          cursor: pointer;
        }

        .info-guide-close:focus-visible,
        .info-guide-confirm:focus-visible {
          outline: 2px solid #61e8ff;
          outline-offset: 3px;
        }

        .info-guide-steps {
          list-style: none;
          display: grid;
          gap: 0;
          margin: 0;
          padding: 0;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .info-guide-steps li {
          display: grid;
          grid-template-columns: 30px minmax(0, 1fr);
          gap: 10px;
          padding: 11px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .info-guide-step-number {
          width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(97, 232, 255, 0.28);
          border-radius: 50%;
          background: rgba(97, 232, 255, 0.07);
          color: #8ee8ff;
          font-size: 0.76rem;
          font-weight: 900;
        }

        .info-guide-steps li > div {
          min-width: 0;
          display: grid;
          gap: 3px;
        }

        .info-guide-steps strong {
          font-size: 0.88rem;
          line-height: 1.3;
        }

        .info-guide-steps li > div > span {
          color: var(--color-text-secondary);
          font-size: 0.8rem;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }

        .info-guide-actions {
          display: flex;
          justify-content: flex-end;
        }

        .info-guide-confirm {
          min-width: 112px;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(97, 232, 255, 0.5);
          border-radius: 8px;
          padding: 0 16px;
          background: #61e8ff;
          color: #061018;
          font: inherit;
          font-weight: 800;
          cursor: pointer;
        }

        @media (max-width: 360px) {
          .info-guide-modal { gap: 12px; }
          .info-guide-header { grid-template-columns: 32px minmax(0, 1fr) 44px; gap: 8px; }
          .info-guide-icon { width: 32px; height: 32px; }
          .info-guide-heading h2 { font-size: 1.05rem; }
          .info-guide-heading p { font-size: 0.8rem; }
          .info-guide-steps li { grid-template-columns: 28px minmax(0, 1fr); gap: 8px; padding: 10px 0; }
          .info-guide-step-number { width: 26px; height: 26px; }
          .info-guide-actions { display: grid; }
          .info-guide-confirm { width: 100%; min-height: 48px; }
        }
      `}</style>
    </AdminModalShell>
  );
}

export default InfoGuideModal;
