import { GameProgress } from './rules';

export function selectVaultAction(games: GameProgress[], now: Date) {
  const eligible = games.filter((game) => !['disabled', 'error', 'empty'].includes(game.status)
    && (!game.deadline || Date.parse(game.deadline.at) > now.getTime()));
  const claim = eligible.find((game) => game.id === 'tower' && game.facts?.canClaim)
    ?? eligible.find((game) => game.id === 'artifacts' && game.facts?.canClaim);
  if (claim) return { game: claim, label: claim.id === 'tower' ? 'Claim secured reward' : 'Exchange completed set' };
  const order = ['guess36', 'spin', 'artifacts'];
  const daily = eligible.filter((game) => order.includes(game.id) && (game.id === 'guess36' ? game.status === 'available' : game.facts?.dailyAvailable))
    .sort((a, b) => (a.deadline ? Date.parse(a.deadline.at) : Infinity) - (b.deadline ? Date.parse(b.deadline.at) : Infinity) || order.indexOf(a.id) - order.indexOf(b.id))[0];
  if (daily) return { game: daily, label: daily.id === 'guess36' ? 'Make today’s guess' : daily.id === 'spin' ? 'Take your daily spin' : 'Forge today’s artifact' };
  const tower = eligible.find((game) => game.id === 'tower' && (game.status === 'active' || (game.facts?.tokenExpiries ?? []).some((at) => Date.parse(at) > now.getTime())));
  return tower ? { game: tower, label: tower.status === 'active' ? 'Continue Tower' : 'Start Tower' } : null;
}

export function selectNextUnlock(games: GameProgress[]) {
  return games.filter((game) => !['disabled', 'error'].includes(game.status)).flatMap((game) =>
    (game.facts?.goals ?? []).filter((goal) => goal.current > 0 && goal.current <= goal.total && (goal.current < goal.total || goal.needsEquipment) && goal.reward.trim())
      .map((goal) => ({ ...goal, game })))
    .sort((a, b) => b.current / b.total - a.current / a.total || Number(b.game.id === 'artifacts') - Number(a.game.id === 'artifacts') || a.id.localeCompare(b.id))[0] ?? null;
}
