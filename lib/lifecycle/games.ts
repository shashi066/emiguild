import { prisma } from '@/lib/prisma';
import { detectCompleteSet, getForgeAvailability } from '@/lib/armory';
import { getSpinState } from '@/lib/daily-spin';
import { getGuess36Current } from '@/lib/guess-36';
import { guess36SelectionLabel } from '@/lib/guess-36-rules';
import { getTowerProgressSnapshot } from '@/lib/tower';
import { fanPickStatusLabel } from '@/lib/watch-party-presentation';
import { EMIC_UNIT_FACTOR } from '@/lib/emic';
import { GameId, GameProgress, VaultItem } from './rules';

export type GameResult = { game: GameProgress; items: VaultItem[] };
export const GAME_LINKS: Record<GameId, { title: string; href: string }> = {
  guess36: { title: 'Guess 36', href: '/guess-36' },
  spin: { title: 'Guild Spin', href: '/daily-spin' },
  artifacts: { title: 'Artifacts', href: '/armory' },
  tower: { title: 'Tower', href: '/tower' },
  'guild-drop': { title: 'Guild Drop', href: '/draws' },
  'watch-party': { title: 'Watch Party', href: '/watch-party' },
  tournaments: { title: 'Tournaments', href: '/tournaments' },
};
function game(id: GameId, data: Partial<GameProgress>): GameProgress {
  return { id, ...GAME_LINKS[id], status: 'empty', summary: 'No current activity', details: [], action: 'View game', ...data };
}
export async function guess36Progress(userId: string, now: Date): Promise<GameResult> {
  const state = await getGuess36Current({ id: userId, role: 'USER' }, now, { readOnly: true });
  const { today, previous } = state;
  const details = [];
  if (today.entry) details.push(`Today’s pick: ${guess36SelectionLabel(today.entry.selection)}. Awaiting the draw.`);
  if (previous.status === 'DRAWN') {
    details.push(`Previous result (${previous.date}): ${previous.winningNumber}. ${previous.outcome === 'WIN' ? 'Your pick won.' : previous.outcome === 'LOSS' ? 'Your pick did not match.' : 'You did not enter.'}`);
    if (previous.reward) details.push(`Earned: ${previous.reward.name}.`);
  } else details.push(`The result for ${previous.date} is being finalized.`);
  return { items: [], game: game('guess36', {
    status: !state.enabled ? 'disabled' : today.entry ? 'active' : today.status === 'OPEN' ? 'available' : 'completed',
    summary: !state.enabled ? 'Guess 36 is paused' : today.entry ? 'Today’s pick confirmed' : today.status === 'OPEN' ? 'Choose today’s pick' : 'Today’s entries are closed',
    details,
    facts: { guessPicks: { today: today.entry ? guess36SelectionLabel(today.entry.selection) : null,
      yesterday: previous.myPick ? guess36SelectionLabel(previous.myPick) : null,
      result: previous.winningNumber } },
    deadline: Date.parse(today.entryClosesAt) > now.getTime() && today.status === 'OPEN'
      ? { at: today.entryClosesAt, label: 'Entries close' } : { at: today.nextRoundAt, label: 'Next round' },
    action: 'Open Guess 36',
  }) };
}

export async function spinProgress(userId: string, now: Date): Promise<GameResult> {
  const state = await getSpinState(userId, now);
  const playable = state.items.some((item) => item.weight > 0);
  const available = state.canSpin && playable;
  const summary = !state.settings.enabled ? 'Daily spin is paused' : state.spin ? 'Today’s spin used' : available ? 'Daily spin available' : 'No spin rewards configured';
  const details = ['One spin each day.'];
  if (state.spin?.lootItem) details.push(`Today’s reward: ${state.spin.lootItem.name}.`);
  details.push(`Current streak: ${state.streak.current} of ${state.streak.target} days. Epic and legendary rewards reset the streak.`);
  const item: VaultItem = { id: 'spin', kind: 'spin', sourceRef: `DailySpin:${userId}:${state.spinDate}`, title: 'Daily spin available',
    description: 'Your daily spin is ready. One spin each day.', href: '/daily-spin', action: 'Open Guild Spin', validUntil: state.nextReset.toISOString(), expires: false };
  return { items: available ? [item] : [], game: game('spin', {
    status: !state.settings.enabled ? 'disabled' : state.spin ? 'completed' : available ? 'available' : 'empty',
    summary, details, action: 'Open Guild Spin',
    facts: { dailyAvailable: available, usedToday: !!state.spin, rewardName: state.spin?.lootItem?.name,
      goals: state.settings.enabled && state.items.some((item) => item.weight > 0 && (item.rarity ?? '').toUpperCase() === 'EPIC')
        ? [{ id: 'spin', title: 'Epic spin reward', current: state.streak.current, total: state.streak.target, reward: 'An Epic reward on the milestone spin' }] : [] },
    progress: { current: state.streak.current, total: state.streak.target, label: 'Daily spin streak' },
    deadline: { at: state.nextReset.toISOString(), label: 'Daily reset' },
  }) };
}

export async function artifactProgress(userId: string, now: Date): Promise<GameResult> {
  const [forge, inventory, loadout, sets] = await Promise.all([
    getForgeAvailability(userId, now),
    prisma.armoryInventory.findMany({ where: { userId, quantity: { gt: 0 } }, select: { artifactId: true, quantity: true } }),
    prisma.armoryLoadout.findUnique({ where: { userId }, include: {
      headgear: { include: { set: true } }, armor: { include: { set: true } },
      gloves: { include: { set: true } }, boots: { include: { set: true } },
    } }),
    prisma.armorySet.findMany({ where: { active: true, rewards: { some: { active: true } } }, include: { artifacts: true, rewards: { where: { active: true } } } }),
  ]);
  const equipped = { HEADGEAR: loadout?.headgear ?? null, ARMOR: loadout?.armor ?? null, GLOVES: loadout?.gloves ?? null, BOOTS: loadout?.boots ?? null };
  const pieces = Object.values(equipped).filter((piece) => piece && inventory.some((row) => row.artifactId === piece.id));
  const groups = new Map<string, { count: number; name: string }>();
  for (const piece of pieces) if (piece) groups.set(piece.setId, { count: (groups.get(piece.setId)?.count ?? 0) + 1, name: piece.set.name });
  const leading = [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0];
  const setId = detectCompleteSet(equipped);
  const reward = setId && pieces.length === 4 ? await prisma.armorySetReward.findUnique({ where: { setId } }) : null;
  const details = [`${inventory.reduce((sum, row) => sum + row.quantity, 0)} artifacts owned.`,
    leading ? `${leading.name}: ${leading.count} of 4 matching pieces equipped.` : 'No matching set equipped.',
    reward?.active ? 'Your equipped set is ready to exchange for its reward.' : 'Equip four matching pieces to unlock a set reward.'];
  const items: VaultItem[] = forge.canForge ? [{ id: 'forge', kind: 'forge', sourceRef: `DailyForge:${userId}:${forge.today}`, title: 'Daily forge available',
    description: 'Forge today to discover an artifact.', href: '/armory', action: 'Open Armory', validUntil: forge.nextResetAt, expires: false }] : [];
  return { items, game: game('artifacts', {
    status: !forge.enabled ? 'disabled' : forge.canForge || reward?.active ? 'available' : forge.claimedToday ? 'completed' : pieces.length ? 'active' : 'empty',
    summary: !forge.enabled ? 'Daily forge is paused' : forge.canForge ? 'Daily forge available' : forge.claimedToday ? 'Today’s artifact forged' : 'Forge unavailable',
    facts: { ownedArtifacts: inventory.reduce((sum, row) => sum + row.quantity, 0), dailyAvailable: forge.canForge, usedToday: forge.claimedToday, canClaim: !!reward?.active,
      slots: Object.entries(equipped).map(([slot, piece]) => ({ slot, name: piece && inventory.some((row) => row.artifactId === piece.id) ? piece.name : null })),
      goals: sets.filter((set) => set.artifacts.length === 4).map((set) => {
        const owned = set.artifacts.filter((piece) => inventory.some((row) => row.artifactId === piece.id)).length;
        return { id: set.id, title: set.name, current: owned, total: 4, reward: set.rewards[0].description, missingOwned: 4 - owned, needsEquipment: owned === 4 && setId !== set.id };
      }),
    },
    details, progress: { current: leading?.count ?? 0, total: 4, label: 'Matching equipped set' },
    deadline: { at: forge.nextResetAt, label: 'Daily forge reset' }, action: 'Open Armory',
  }) };
}

export async function towerProgress(userId: string, now: Date): Promise<GameResult> {
  const state = await getTowerProgressSnapshot(userId, now);
  const { attempt, tokens } = state;
  const details = [`${tokens.length} Tower Token${tokens.length === 1 ? '' : 's'} available.`];
  if (attempt) {
    details.push(`Current floor: ${attempt.level} of ${attempt.totalLevels}.`);
    if (attempt.securedReward) details.push(`Secured: ${attempt.securedReward.name}.`);
    if (attempt.canClaim) details.push('Your secured reward is available to claim.');
  }
  const items: VaultItem[] = state.enabled ? tokens.map((token) => ({ id: `token:${token.id}`, kind: 'token', sourceRef: `TowerToken:${token.id}`,
    title: '1 Tower Token available', description: 'A token in your account is ready to use.', href: '/tower', action: 'Open Tower', validUntil: token.expiresAt.toISOString(), expires: true })) : [];
  return { items, game: game('tower', {
    status: !state.enabled ? 'disabled' : attempt ? 'active' : tokens.length ? 'available' : 'empty',
    summary: !state.enabled ? 'Tower is paused' : attempt?.canClaim ? 'Reward ready to claim' : attempt ? 'Climb in progress' : tokens.length ? 'Ready to climb' : 'No current climb',
    details, action: 'Open Tower',
    facts: { review: state.review, tokenCount: tokens.length, tokenExpiries: tokens.map((token) => token.expiresAt.toISOString()), canClaim: attempt?.canClaim ?? false, rewardName: attempt?.securedReward?.name },
    ...(attempt ? { progress: { current: attempt.level, total: attempt.totalLevels, label: 'Tower floor' }, deadline: { at: attempt.runExpiresAt, label: 'Run ends' } }
      : tokens[0] ? { deadline: { at: tokens[0].expiresAt.toISOString(), label: 'Next token expires' } } : {}),
  }) };
}

export async function guildDropProgress(userId: string, now: Date): Promise<GameResult> {
  const entries = await prisma.drawEntry.findMany({ where: { userId, draw: { status: { not: 'DRAFT' } } }, include: { draw: true }, orderBy: { createdAt: 'desc' } });
  const current = entries.filter(({ draw }) => ['ACTIVE', 'CLOSED'].includes(draw.status) && !draw.winnerPickedAt);
  const latest = entries.filter(({ draw }) => draw.status === 'CLOSED' && draw.winnerId && draw.winnerPickedAt && draw.winnerPickedAt <= now)
    .sort((a, b) => b.draw.winnerPickedAt!.getTime() - a.draw.winnerPickedAt!.getTime())[0];
  const details = current.map(({ draw }) => `${draw.title}: ${draw.endsAt && draw.endsAt <= now ? 'awaiting result' : 'entry confirmed'}.`);
  if (latest) details.push(`Latest result — ${latest.draw.title}: ${latest.draw.winnerId === userId ? `you won ${latest.draw.prize}` : 'another player won'}.`);
  const next = current.map(({ draw }) => draw.endsAt).filter((date): date is Date => !!date && date > now).sort((a, b) => a.getTime() - b.getTime())[0];
  return { items: [], game: game('guild-drop', { status: current.length ? 'active' : latest ? 'completed' : 'empty',
    facts: { events: current.map(({ draw }) => ({ id: draw.id, title: draw.title, participation: draw.endsAt && draw.endsAt <= now ? 'Awaiting result' : 'Entry confirmed', ...(draw.endsAt ? { at: draw.endsAt.toISOString() } : {}) })) },
    summary: current.length ? `${current.length} current entr${current.length === 1 ? 'y' : 'ies'}` : 'No current entries', details, action: 'View Guild Drops',
    ...(next ? { deadline: { at: next.toISOString(), label: 'Next draw closes' } } : {}),
  }) };
}

export async function watchPartyProgress(userId: string, now: Date): Promise<GameResult> {
  const [invites, latest] = await Promise.all([
    prisma.watchPartyInvite.findMany({ where: { userId, party: { status: 'ACTIVE' } }, include: { party: { include: { predictions: { where: { userId } } } } }, orderBy: { party: { kickoffAt: 'asc' } } }),
    prisma.watchPartyPrediction.findFirst({ where: { userId, status: { in: ['WON', 'LOST', 'VOID'] }, party: { status: 'CLOSED', settledAt: { lte: now } } }, include: { party: true }, orderBy: { party: { settledAt: 'desc' } } }),
  ]);
  const details = invites.map((invite) => {
    const pick = invite.party.predictions[0];
    return `${invite.party.title}: ${invite.enteredAt ? 'joined' : invite.checkedInAt ? 'checked in' : 'invited'}; ${pick ? `pick ${pick.optionLabel} — ${fanPickStatusLabel(pick.status)}` : 'no prediction yet'}.`;
  });
  if (latest) details.push(`Latest result — ${latest.party.title}: ${fanPickStatusLabel(latest.status)}${latest.payoutUnits != null ? ` (${latest.payoutUnits / EMIC_UNIT_FACTOR} EMIC credited)` : ''}.`);
  const next = invites.map(({ party }) => party.predictionLockAt ?? party.kickoffAt).filter((date) => date > now).sort((a, b) => a.getTime() - b.getTime())[0];
  return { items: [], game: game('watch-party', { status: invites.length ? 'active' : latest ? 'completed' : 'empty', summary: invites.length ? `${invites.length} current event${invites.length === 1 ? '' : 's'}` : 'No current events',
    facts: { events: invites.map((invite) => ({ id: invite.party.id, title: invite.party.title, participation: invite.enteredAt ? 'Joined' : 'Invited', at: invite.party.kickoffAt.toISOString() })) },
    details, action: 'View Watch Parties', ...(next ? { deadline: { at: next.toISOString(), label: 'Next prediction cutoff' } } : {}),
  }) };
}

export async function tournamentProgress(userId: string): Promise<GameResult> {
  const players = await prisma.tournamentPlayer.findMany({ where: { userId }, include: { tournament: true,
    matchesAsP1: true, matchesAsP2: true, matchesWon: true }, orderBy: { tournament: { updatedAt: 'desc' } } });
  const current = players.filter(({ tournament }) => ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ONGOING'].includes(tournament.status));
  const latest = players.find(({ tournament }) => tournament.status === 'FINISHED');
  const details = current.map((player) => {
    const matches = [...player.matchesAsP1, ...player.matchesAsP2].sort((a, b) => a.round - b.round || a.matchIndex - b.matchIndex);
    const next = matches.find((match) => match.status !== 'COMPLETED');
    const eliminated = matches.some((match) => match.status === 'COMPLETED' && match.winnerId && match.winnerId !== player.id);
    return `${player.tournament.name}: ${eliminated ? 'eliminated' : next ? `round ${next.round}${next.status === 'IN_PROGRESS' ? ' in progress' : ' upcoming'}` : 'registered; awaiting next match'}; ${player.matchesWon.filter((match) => match.status === 'COMPLETED' && !match.isBye).length} recorded wins.`;
  });
  if (latest) {
    const matches = [...latest.matchesAsP1, ...latest.matchesAsP2].sort((a, b) => b.round - a.round);
    const last = matches[0];
    details.push(`Latest completed — ${latest.tournament.name}: ${last?.status === 'COMPLETED' ? last.winnerId === latest.id ? 'won last match' : 'lost last match' : 'no recorded match result'}; ${latest.matchesWon.filter((match) => match.status === 'COMPLETED' && !match.isBye).length} wins.`);
  }
  return { items: [], game: game('tournaments', { status: current.length ? 'active' : latest ? 'completed' : 'empty', summary: current.length ? `${current.length} current registration${current.length === 1 ? '' : 's'}` : 'No current registrations', details, action: 'View tournaments' }) };
}

export const gameLoaders: Record<GameId, (userId: string, now: Date) => Promise<GameResult>> = {
  guess36: guess36Progress, spin: spinProgress, artifacts: artifactProgress, tower: towerProgress,
  'guild-drop': guildDropProgress, 'watch-party': watchPartyProgress, tournaments: tournamentProgress,
};

export async function loadGameSections(userId: string, now: Date, loaders = gameLoaders): Promise<GameResult[]> {
  const entries = Object.entries(loaders) as [GameId, (userId: string, now: Date) => Promise<GameResult>][];
  const results = await Promise.allSettled(entries.map(([, load]) => load(userId, now)));
  return results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const id = entries[index][0];
    console.error(`Vault ${id} section failed`, result.reason);
    return { items: [], game: game(id, { status: 'error', summary: 'Progress temporarily unavailable', details: ['Refresh the Vault to try again.'], action: 'Open game' }) };
  });
}
