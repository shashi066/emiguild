'use client';
import { Ticket } from 'lucide-react';
import HeroButton from './HeroButton';
import styles from './HappyTicketHeroButton.module.css';

export function HappyTicketHeroButton() {
  return <HeroButton label="Happy Ticket" icon={Ticket} href="/happy-tickets" variant="ghost" className={`happy-ticket-btn ${styles.button}`} />;
}
