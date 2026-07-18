import { Shield, Sparkles } from 'lucide-react';

export default function Loading() {
  return (
    <main className="armory-route-loading" aria-live="polite" aria-busy="true">
      <div className="armory-route-loader">
        <span className="armory-route-spinner">
          <Shield size={30} />
        </span>
        <div>
          <strong>Loading Artifacts...</strong>
          <span><Sparkles size={14} /> Preparing your vault</span>
        </div>
      </div>

      <style>{`
        .armory-route-loading {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          background: #070b14;
          color: var(--color-text-primary);
        }

        .armory-route-loader {
          display: grid;
          justify-items: center;
          gap: 12px;
          text-align: center;
        }

        .armory-route-spinner {
          width: 88px;
          aspect-ratio: 1;
          border-radius: 50%;
          display: grid;
          place-items: center;
          position: relative;
          color: #61e8ff;
        }

        .armory-route-spinner::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 2px solid rgba(255,255,255,0.18);
          border-top-color: #61e8ff;
          animation: armoryRouteSpin 850ms linear infinite;
        }

        .armory-route-spinner svg {
          position: relative;
          z-index: 1;
        }

        .armory-route-loader strong {
          display: block;
          margin-bottom: 6px;
          font-family: var(--font-orbitron);
          font-size: 1.25rem;
          line-height: 1.2;
        }

        .armory-route-loader span:last-child {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: var(--color-text-secondary);
          font-size: 0.9rem;
        }

        @keyframes armoryRouteSpin {
          to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .armory-route-spinner::before {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
