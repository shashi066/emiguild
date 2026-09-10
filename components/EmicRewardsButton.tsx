'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';

export function EmicRewardsButton() {
  return (
    <>
      <Link href="/rewards" className="emic-rewards-shortcut" aria-label="Open EMIC Rewards shop">
        <ShoppingBag size={16} aria-hidden="true" />
        <b>Rewards</b>
      </Link>
      <style jsx>{`
        :global(.emic-rewards-shortcut) {
          min-height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          flex: 0 0 auto;
          padding: 0 8px;
          border: 1px solid #b88922;
          border-radius: 6px;
          background: #33260b;
          color: #ffe28a;
          font: inherit;
          font-size: 0.7rem;
          font-weight: 800;
          line-height: 1;
          text-decoration: none;
          text-transform: none;
        }
        :global(.emic-rewards-shortcut b) { color: inherit; font: inherit; text-transform: none; }
        :global(.emic-rewards-shortcut:hover) { background: #44330d; }
        :global(.emic-rewards-shortcut:focus-visible) { outline: 2px solid #facc15; outline-offset: 2px; }
        @media (max-width: 420px) {
          :global(.emic-rewards-shortcut) { width: 36px; padding: 0; }
          :global(.emic-rewards-shortcut b) { display: none; }
        }
      `}</style>
    </>
  );
}

export default EmicRewardsButton;
