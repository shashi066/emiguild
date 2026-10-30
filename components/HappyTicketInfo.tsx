'use client';
import { useId, useState } from 'react';
import { Clock3, Gamepad2, RotateCcw, Ticket } from 'lucide-react';
import { InfoGuideButton } from './InfoGuideButton';
import { InfoGuideModal } from './InfoGuideModal';
export function HappyTicketInfo({ hours, resets }: { hours?: string; resets?: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const steps = [
    { title: 'Claim your hour', description: 'Your account starts with five tickets. Claim one for a free base PS5 screen-hour. Your balance and claimed tickets are yours alone. One claim every 24 hours.', visual: { kind: 'icon' as const, icon: Ticket, label: 'Happy Ticket' } },
    { title: 'When you can play', description: `${hours ? `Eligible hours: ${hours}. ` : ''}Use an eligible PS5 station. Extra time, controllers and food remain payable. No stacking with passes or discounts.`, visual: { kind: 'icon' as const, icon: Gamepad2, label: 'PS5 session' } },
    { title: 'Banked resets', description: `${resets === undefined ? '' : resets === 0 ? 'No resets available right now. ' : `${resets} banked resets available. `}Use one of your own resets to refill your tickets to five, even if tickets remain. Admin reset grants go to existing accounts only. It consumes one reset and does not change your claim cooldown.`, visual: { kind: 'icon' as const, icon: RotateCcw, label: 'Your resets' } },
    { title: 'Use it today', description: 'New tickets expire at 11:59 PM IST on the day claimed. Your entire booking must finish before expiry. Valid pre-start cancellation returns the ticket with its original expiry.', visual: { kind: 'icon' as const, icon: Clock3, label: 'Expiry' } },
  ];
  return <><InfoGuideButton ariaLabel="How Happy Tickets work" onClick={() => setOpen(true)} />{open && <InfoGuideModal eyebrow="Happy Ticket Guide" title="Claim. Reset. Play." subtitle="Your free guild hour" titleId={id} steps={steps} onClose={() => setOpen(false)} lightweight />}</>;
}
