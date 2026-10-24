import { rollFusionTier, type FusionTier } from '../lib/armory-fusion-rules';

// Planning model, not a forecast: daily forge only, default launch weights,
// automatic set redemption, one retained copy per slot, no trades/check-in grants.
const tiers: FusionTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
const USERS = 5000, DAYS = 180;
function simulate(fusion: boolean) {
  let seed = 20261023;
  const random = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * max); };
  const weighted = (weights: number[]) => { let n = random(100); for (let i = 0; i < weights.length; i++) { if (n < weights[i]) return i; n -= weights[i]; } throw new Error(); };
  const tickets = [0, 0, 0, 0]; let fusions = 0;
  for (let user = 0; user < USERS; user++) {
    const stock = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    for (let day = 0; day < DAYS; day++) {
      stock[weighted([40, 30, 20, 10])][weighted([10, 20, 30, 40])]++;
      let changed = true;
      while (changed) {
        changed = false;
        for (let t = 0; t < 4; t++) {
          while (stock[t].every(n => n > 0)) { stock[t] = stock[t].map(n => n - 1); tickets[t]++; changed = true; }
          if (t < 3) for (let s = 0; s < 4; s++) while (stock[t][s] >= 4) { stock[t][s] -= 3; stock[t + 1][s]++; changed = true; }
          if (fusion && stock[t].reduce((sum, n) => sum + Math.max(0, n - 1), 0) >= 3) {
            let remaining = 3;
            for (let s = 0; s < 4; s++) { const used = Math.min(remaining, Math.max(0, stock[t][s] - 1)); stock[t][s] -= used; remaining -= used; }
            const target = tiers.indexOf(rollFusionTier(tiers[t], random(100)));
            const slot = t === 3 ? stock[3].indexOf(Math.min(...stock[3])) : random(4);
            stock[target][slot]++; fusions++; changed = true;
          }
        }
      }
    }
  }
  return { users: USERS, days: DAYS, ticketsPerUser: Object.fromEntries(tiers.map((t, i) => [t, +(tickets[i] / USERS).toFixed(3)])), totalTicketsPerUser: +(tickets.reduce((a, b) => a + b) / USERS).toFixed(3), fusionsPerUser: +(fusions / USERS).toFixed(3) };
}
console.log(JSON.stringify({ assumptions: 'Default forge weights; 5000 users x 180 daily forges; immediate redemption; retain one copy per slot; guaranteed upgrades first; optional fusion of remaining spares. Excludes trading, grants, attendance and monetary valuation. Independent deterministic seeded policy runs, not paired causal estimates.', existing: simulate(false), withFusion: simulate(true) }, null, 2));
