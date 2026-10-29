'use client';
import { useId, useState } from 'react';
import { Clock3, Gamepad2, RotateCcw, Ticket } from 'lucide-react';
import { InfoGuideButton } from './InfoGuideButton';
import { InfoGuideModal } from './InfoGuideModal';
export function HappyTicketInfo({ hours, resets }: { hours?: string; resets?: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const steps = [
    { title: 'Claim your hour', description: 'Five tickets are available for all users per refill. Claim one for your own free base PS5 screen-hour. Your claimed ticket belongs only to you. One claim every 24 hours.', visual: { kind: 'icon' as const, icon: Ticket, label: 'Happy Ticket' } },
    { title: 'When you can play', description: `${hours ? `Eligible hours: ${hours}. ` : ''}Use an eligible PS5 station. Extra time, controllers and food remain payable. No stacking with passes or discounts.`, visual: { kind: 'icon' as const, icon: Gamepad2, label: 'PS5 session' } },
    { title: 'Banked resets', description: `${resets === undefined ? '' : resets === 0 ? 'No resets available right now. ' : `${resets} banked resets available. `}Any signed-in member can use one to refill the shared pool to five, even if tickets remain. It consumes one reset and does not change your claim cooldown.`, visual: { kind: 'icon' as const, icon: RotateCcw, label: 'Reset pool' } },
    { title: 'Use it today', description: 'New tickets expire at 11:59 PM IST on the day claimed. Your entire booking must finish before expiry. Valid pre-start cancellation returns the ticket with its original expiry.', visual: { kind: 'icon' as const, icon: Clock3, label: 'Expiry' } },
  ];
  return <><InfoGuideButton ariaLabel="How Happy Tickets work" onClick={() => setOpen(true)} />{open && <InfoGuideModal eyebrow="Happy Ticket Guide" title="Claim. Reset. Play." subtitle="Your free guild hour" titleId={id} steps={steps} onClose={() => setOpen(false)} lightweight />}</>;
}
