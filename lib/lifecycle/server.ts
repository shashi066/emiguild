import { prisma } from '@/lib/prisma';
import { getArtifactRewardTicketDisplay } from '@/lib/reward-ticket';
import { serializeTowerRewardTicket } from '@/lib/tower';
import { serializeGuess36RewardTicket } from '@/lib/guess-36';
import { AccountState, VaultItem, orderVaultItems } from './rules';
import { loadGameSections } from './games';

async function getRewardItems(userId: string, now: Date): Promise<VaultItem[]> {
  const tickets = await prisma.armoryTicket.findMany({ where: { userId, status: 'UNUSED', expiresAt: { gt: now } }, include: { set: { select: { name: true } } } });
  return tickets.map((ticket) => {
    const origin = ticket.source === 'TOWER' ? 'Tower' : ticket.source === 'GUESS_36' ? 'Guess 36' : 'Artifact';
    const title = ticket.source === 'TOWER' ? serializeTowerRewardTicket(ticket).reward.name
      : ticket.source === 'GUESS_36' ? serializeGuess36RewardTicket(ticket).reward.name
      : getArtifactRewardTicketDisplay(ticket).description;
    return {
      id: `ticket:${ticket.id}`, kind: 'reward', sourceRef: `ArmoryTicket:${ticket.id}`,
      title: `${origin} reward available`, description: title,
      href: ticket.source === 'TOWER' ? '/tower' : ticket.source === 'GUESS_36' ? '/guess-36' : '/armory',
      action: 'View reward', validUntil: ticket.expiresAt.toISOString(), expires: true,
    };
  });
}

// Each domain read is isolated; unavailable data never becomes a fake empty game.
export async function getVaultState(userId: string, now: Date = new Date()): Promise<AccountState> {
  const [rewards, sections] = await Promise.all([
    getRewardItems(userId, now).then((items) => ({ items, unavailable: false })).catch((error) => {
      console.error('Vault rewards failed', error);
      return { items: [] as VaultItem[], unavailable: true };
    }),
    loadGameSections(userId, now),
  ]);
  return { userId, evaluatedAt: now.toISOString(), rewardsUnavailable: rewards.unavailable,
    items: orderVaultItems([...rewards.items, ...sections.flatMap((section) => section.items)], now),
    games: sections.map((section) => section.game),
  };
}
