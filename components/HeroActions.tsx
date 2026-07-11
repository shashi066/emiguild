'use client';

import HeroButton from './HeroButton';
import { Calendar, Monitor, Award, Gamepad2, RotateCcw, Gift, Trophy } from 'lucide-react';

export default function HeroActions() {
  return (
    <div className="hero-actions-container">
      <div className="hero-actions-primary">
        <HeroButton label="Book a Slot Now" icon={Calendar} href="/book" variant="primary-blue" id="hero-book-btn" />
        <HeroButton label="Tournament" icon={Trophy} href="/tournaments" variant="primary-red" />
      </div>

      <div className="hero-actions-secondary">
        <HeroButton label="Monthly Passes" icon={Award} href="/passes" variant="secondary-gold" />
        <HeroButton label="View Stations" icon={Monitor} targetId="stations" variant="secondary-gray" />
        <HeroButton label="Available Games" icon={Gamepad2} href="/games" variant="secondary-green" />
        <HeroButton label="Daily Spin" icon={RotateCcw} href="/daily-spin" variant="secondary-purple" />
      </div>

      <div className="hero-actions-tertiary">
        <HeroButton label="Guild Drop" icon={Gift} href="/draws" variant="secondary-orange" />
      </div>
    </div>
  );
}