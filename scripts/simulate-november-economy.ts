import { prisma } from '../lib/prisma';
import { DEFAULT_TOWER_REWARDS, DEFAULT_TOWER_RED_CARDS_PER_FLOOR, type TowerRewardConfig, type TowerFloorRiskConfig } from '../lib/tower';
let seed = 20261027;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }
async function main() {
  // Read-only: no account data, configuration writes, or real grants.
  const [items, settings] = await Promise.all([
    prisma.lootItem.findMany({ where: { enabled: true, weight: { gt: 0 } }, select: { rarity: true, weight: true } }),
    prisma.setting.findMany({ where: { key: { in: ['tower_rewards', 'tower_red_cards_per_floor'] } }, select: { key: true, value: true } }),
  ]);
  const weights: Record<string, number> = {};
  for (const item of items) { const rarity = item.rarity?.toUpperCase() ?? 'COMMON'; weights[rarity] = (weights[rarity] ?? 0) + item.weight; }
  if (!weights.LEGENDARY || !weights.EPIC) throw new Error('Provide a configured Epic and Legendary pool.');
  const total = Object.values(weights).reduce((a,b) => a+b,0);
  function simulate(guarantee: boolean) {
    seed = 20261027;
    let legendaries = 0, epics = 0, forcedLegendaries = 0;
    for (let player = 0; player < 10_000; player++) {
      let epicStreak = 0, pity = 0;
      for (let day = 0; day < 90; day++) {
        let roll = random() * total;
        let rarity = 'COMMON';
        for (const [name, weight] of Object.entries(weights)) { roll -= weight; if (roll < 0) { rarity = name; break; } }
        if (guarantee && pity >= 29) { rarity = 'LEGENDARY'; forcedLegendaries++; }
        else if (epicStreak >= 9) rarity = 'EPIC';
        if (rarity === 'LEGENDARY') { legendaries++; pity = 0; epicStreak = 0; }
        else { pity++; if (rarity === 'EPIC') { epics++; epicStreak = 0; } else epicStreak++; }
      }
    }
    return { spins: 900_000, legendaries, epics, forcedLegendaries, legendariesPer1000Spins: legendaries / 900, epicsPer1000Spins: epics / 900 };
  }
  const rewards: TowerRewardConfig[] = JSON.parse(settings.find(s => s.key === 'tower_rewards')?.value ?? JSON.stringify(DEFAULT_TOWER_REWARDS));
  const risks: TowerFloorRiskConfig[] = JSON.parse(settings.find(s => s.key === 'tower_red_cards_per_floor')?.value ?? JSON.stringify(DEFAULT_TOWER_RED_CARDS_PER_FLOOR));
  let survival = 1;
  const losses = rewards.map((reward, index) => {
    const red = risks.find(r => r.level === index + 1)?.redCount ?? 1;
    const probability = survival * red / 3; survival *= 1 - red / 3;
    return { reachedFloor: index + 1, probability, protectedReward: index ? rewards[index - 1].name : null };
  });
  console.log(JSON.stringify({ source: 'Explicit database connection; verify production configuration separately', assumptions: '10,000 players, 90 consecutive daily spins each; no missed days. Tower always-climb policy. No currency valuation or behavioral forecast.', seed: 20261027, spinWeights: weights, before: simulate(false), after: simulate(true), tower: { losses, finalClearProbability: survival, beforeTicketsPer1000Runs: survival * 1000, afterTicketsPer1000Runs: (1 - losses[0].probability) * 1000 }, happyTickets: 'Five initial claimable hours PER ACCOUNT. Each personal reset adds 0 to 5 hours only to its owner. Bulk grants give one copy to each existing account; later signups are excluded. Bulk refills may add up to 5 times existing accounts hours. No automatic refills.' }, null, 2));
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Simulation failed'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
