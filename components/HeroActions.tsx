'use client';

import HeroButton from './HeroButton';
import { Calendar, Monitor, Award, Gamepad2, RotateCcw, Gift, Trophy, Shield, Tv } from 'lucide-react';

export default function HeroActions() {
  return (
    <div className="hero-actions">
      <HeroButton label="Book a Slot Now" icon={Calendar} href="/book" variant="primary" id="hero-book-btn" />
      <HeroButton label="View Stations" icon={Monitor} targetId="stations" variant="station" />
      <HeroButton label="Monthly Passes" icon={Award} href="/passes" variant="pass" />
      <HeroButton label="Available Games" icon={Gamepad2} href="/games" variant="games" />
      <HeroButton label="Artifacts" icon={Shield} href="/armory" variant="armory" />
      <HeroButton label="Daily Spin" icon={RotateCcw} href="/daily-spin" variant="spin" animation="spin" />
      <HeroButton label="Guild Drop" icon={Gift} href="/draws" variant="drop" animation="lucky" />
      <HeroButton label="Tournament" icon={Trophy} href="/tournaments" variant="tournament" animation="tournament" />
      <HeroButton label="Watch Party" icon={Tv} href="/watch-party" variant="watch" className="watch-party-btn" />
    </div>
  );
}
