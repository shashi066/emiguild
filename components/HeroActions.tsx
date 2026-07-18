'use client';

import { useState } from 'react';
import HeroButton from './HeroButton';
import { Calendar, Monitor, Award, Gamepad2, RotateCcw, Gift, Trophy, Crown, X, Shield } from 'lucide-react';

export default function HeroActions() {
  const [showDungeonSoon, setShowDungeonSoon] = useState(false);

  return (
    <>
      <div className="hero-actions">
        <HeroButton label="Book a Slot Now" icon={Calendar} href="/book" variant="primary" id="hero-book-btn" />
        <HeroButton label="View Stations" icon={Monitor} targetId="stations" variant="station" />
        <HeroButton label="Monthly Passes" icon={Award} href="/passes" variant="pass" />
        <HeroButton label="Available Games" icon={Gamepad2} href="/games" variant="games" />
        <HeroButton label="Artifacts" icon={Shield} href="/armory" variant="armory" />
        <HeroButton label="Daily Spin" icon={RotateCcw} href="/daily-spin" variant="spin" animation="spin" />
        <HeroButton label="Guild Drop" icon={Gift} href="/draws" variant="drop" animation="lucky" />
        <HeroButton label="Tournament" icon={Trophy} href="/tournaments" variant="tournament" animation="tournament" />
        <HeroButton
          label="Dungeon Gate"
          icon={Crown}
          variant="dungeon"
          className="dungeon-gate-btn"
          onClick={() => setShowDungeonSoon(true)}
        />
      </div>

      {showDungeonSoon && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dungeon-coming-soon-title"
          className="dungeon-coming-soon-backdrop"
          onClick={() => setShowDungeonSoon(false)}
        >
          <div className="dungeon-coming-soon-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="dungeon-coming-soon-close"
              aria-label="Close"
              onClick={() => setShowDungeonSoon(false)}
            >
              <X size={18} />
            </button>
            <img
              src="/images/dungeon-gate-coming-soon.webp"
              alt="Dungeon boss"
              className="dungeon-coming-soon-img"
            />
            <div className="dungeon-coming-soon-copy">
              <div className="badge" style={{ color: '#55d7ff', background: 'rgba(0, 174, 255, 0.12)' }}>
                Coming Soon
              </div>
              <h2 id="dungeon-coming-soon-title" className="font-orbitron">
                Dungeon Gate
              </h2>
              <p>The gate is sealed for now. A new boss story will open later.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
