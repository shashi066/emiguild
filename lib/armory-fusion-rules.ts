export const FUSION_VERSION = 'fusion-v1';
export const FUSION_ODDS = {
  BRONZE: { BRONZE: 60, SILVER: 30, GOLD: 9, PLATINUM: 1 },
  SILVER: { SILVER: 65, GOLD: 30, PLATINUM: 5 },
  GOLD: { GOLD: 75, PLATINUM: 25 },
  PLATINUM: { PLATINUM: 100 },
} as const;
export type FusionTier = keyof typeof FUSION_ODDS;
export type FusionInput = { requestId: string; ingredients: { artifactId: string; quantity: number }[]; chosenOutputId?: string };
export function normalizeFusion(value: unknown): FusionInput {
  const input = value as FusionInput;
  if (!input || typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId)
    || !Array.isArray(input.ingredients) || !input.ingredients.length || input.ingredients.length > 3) throw new Error('INVALID_FUSION');
  const counts = new Map<string, number>();
  for (const item of input.ingredients) {
    if (!item || typeof item.artifactId !== 'string' || !item.artifactId || item.artifactId.length > 150
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 3) throw new Error('INVALID_FUSION');
    counts.set(item.artifactId, (counts.get(item.artifactId) ?? 0) + item.quantity);
  }
  if ([...counts.values()].reduce((a, b) => a + b, 0) !== 3) throw new Error('INVALID_FUSION');
  if (input.chosenOutputId !== undefined && (typeof input.chosenOutputId !== 'string' || !input.chosenOutputId || input.chosenOutputId.length > 150)) throw new Error('INVALID_FUSION');
  return { requestId: input.requestId, ingredients: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([artifactId, quantity]) => ({ artifactId, quantity })), ...(input.chosenOutputId ? { chosenOutputId: input.chosenOutputId } : {}) };
}
export function rollFusionTier(tier: FusionTier, roll: number): FusionTier {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 100) throw new Error('INVALID_ROLL');
  let boundary = 0;
  for (const [result, weight] of Object.entries(FUSION_ODDS[tier])) {
    boundary += weight;
    if (roll < boundary) return result as FusionTier;
  }
  throw new Error('INVALID_FUSION');
}
