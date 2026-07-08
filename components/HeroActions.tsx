'use client';

import HeroButton from './HeroButton';
import { Calendar, Monitor, Award, Gamepad2, RotateCcw, Gift, Trophy } from 'lucide-react';

export default function HeroActions() {
  return (
    <div className="hero-actions">
      <HeroButton label="Book a Slot Now" icon={Calendar} href="/book" variant="primary" id="hero-book-btn" />
      <HeroButton label="View Stations" icon={Monitor} targetId="stations" />
      <HeroButton label="Monthly Passes" icon={Award} href="/passes" variant="gold" />
      <HeroButton label="Available Games" icon={Gamepad2} href="/games" variant="green" />
      <HeroButton label="Daily Spin" icon={RotateCcw} href="/daily-spin" variant="purple" animation="spin" />
      <HeroButton label="Guild Drop" icon={Gift} href="/draws" variant="red" animation="lucky" />
      <HeroButton label="Tournament" icon={Trophy} href="/tournaments" variant="red" animation="tournament" />
    </div>
  );
}