import {
  Clock3,
  Gamepad2,
  Percent,
  Shield,
  Ticket,
  Zap,
} from 'lucide-react';
import type { RewardTicketDisplay, RewardTicketKind } from '@/lib/reward-ticket';

const ICONS: Record<RewardTicketKind, typeof Ticket> = {
  discount: Percent,
  gaming: Gamepad2,
  racing: Zap,
  pass: Shield,
  reward: Ticket,
};

export function RewardTicketCard({ ticket }: { ticket: RewardTicketDisplay }) {
  const Icon = ICONS[ticket.kind];

  return (
    <article className={`reward-ticket-card ${ticket.kind}`} aria-label={`${ticket.label}: ${ticket.value}`}>
      <header>
        <span><Icon size={16} aria-hidden="true" /> {ticket.label}</span>
        <strong>{ticket.value}</strong>
      </header>
      <div>
        <span>{ticket.origin}</span>
        <h3>{ticket.description}</h3>
      </div>
      <footer><Clock3 size={14} aria-hidden="true" /> {ticket.expiry}</footer>
      <style jsx>{`
        .reward-ticket-card { min-width: 0; min-height: 148px; display: grid; align-content: space-between; gap: 10px; padding: 13px 14px; border: 1px solid #2a384b; border-left: 3px solid #94a3b8; border-radius: 7px; background: #101824; color: var(--color-text-primary); }
        .reward-ticket-card.discount { border-left-color: #e7c260; }
        .reward-ticket-card.gaming { border-left-color: #6bd7e5; }
        .reward-ticket-card.racing { border-left-color: #8cb4ef; }
        .reward-ticket-card.pass { border-left-color: #66c58f; }
        header { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        header span, footer { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-secondary); font-size: .75rem; font-weight: 750; }
        header strong { color: #eef4fa; font-size: 1.06rem; line-height: 1.2; text-align: right; overflow-wrap: anywhere; }
        div { min-width: 0; display: grid; gap: 3px; }
        div span { color: var(--color-text-muted); font-size: .7rem; }
        h3 { margin: 0; color: var(--color-text-primary); font-size: .88rem; line-height: 1.35; overflow-wrap: anywhere; }
        footer { padding-top: 8px; border-top: 1px solid #253246; color: var(--color-text-muted); font-size: .69rem; }
      `}</style>
    </article>
  );
}
