'use client';

import HeroButton from './HeroButton';
import { Award, Calendar, Gamepad2, Monitor, Package, ShoppingBag, Tv } from 'lucide-react';
import type { Ps5RentalAvailability } from '@/lib/ps5-rental';

export default function HeroActions({ ps5RentalStatus }: { ps5RentalStatus: Ps5RentalAvailability }) {
  return (
    <div className="hero-actions">
      <HeroButton label="Book a Slot Now" icon={Calendar} href="/book" variant="primary" id="hero-book-btn" />
      {ps5RentalStatus !== 'DISABLED' && (
        <HeroButton
          label={ps5RentalStatus === 'COMING_SOON' ? 'PS5 Rentals' : 'Rent a PS5'}
          icon={Package}
          href="/ps5-rental"
          className="hero-ps5-rental-btn"
          id="hero-rent-ps5-btn"
        />
      )}
      <HeroButton label="View Stations" icon={Monitor} targetId="stations" variant="station" />
      <HeroButton label="Monthly Passes" icon={Award} href="/passes" variant="pass" />
      <HeroButton label="Available Games" icon={Gamepad2} href="/games" variant="games" />
      <HeroButton label="Watch Party" icon={Tv} href="/watch-party" variant="watch" className="watch-party-btn" />
      <HeroButton label="EMIC Rewards" icon={ShoppingBag} href="/rewards" variant="gold" className="emic-rewards-btn" />
    </div>
  );
}
