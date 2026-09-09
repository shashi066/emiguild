'use client';

import HeroButton from './HeroButton';
import { Award, Calendar, Gamepad2, Monitor, ShoppingBag, Tv } from 'lucide-react';

export default function HeroActions() {
  return (
    <div className="hero-actions">
      <HeroButton label="Book a Slot Now" icon={Calendar} href="/book" variant="primary" id="hero-book-btn" />
      <HeroButton label="View Stations" icon={Monitor} targetId="stations" variant="station" />
      <HeroButton label="Monthly Passes" icon={Award} href="/passes" variant="pass" />
      <HeroButton label="Available Games" icon={Gamepad2} href="/games" variant="games" />
      <HeroButton label="Watch Party" icon={Tv} href="/watch-party" variant="watch" className="watch-party-btn" />
      <HeroButton label="EMIC Rewards" icon={ShoppingBag} href="/rewards" variant="gold" className="emic-rewards-btn" />
    </div>
  );
}
