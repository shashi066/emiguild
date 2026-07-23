export const DEFAULT_ARMORY_TRADE_GEM_COST = 1;
export const DEFAULT_ARMORY_TRADE_DURATION_HOURS = 24;
export const MIN_ARMORY_TRADE_GEM_COST = 1;
export const MAX_ARMORY_TRADE_GEM_COST = 100;
export const MIN_ARMORY_TRADE_DURATION_HOURS = 1;
export const MAX_ARMORY_TRADE_DURATION_HOURS = 168;
export const ARMORY_TRADE_DURATION_MS =
  DEFAULT_ARMORY_TRADE_DURATION_HOURS * 60 * 60 * 1000;

export function armoryTradeExpiresAt(
  now = new Date(),
  durationHours = DEFAULT_ARMORY_TRADE_DURATION_HOURS,
) {
  return new Date(now.getTime() + durationHours * 60 * 60 * 1000);
}

export function availableTradeCopies(
  quantity: number,
  artifactId: string,
  equippedArtifactIds: Array<string | null | undefined>,
) {
  const equippedCopies = equippedArtifactIds.filter((id) => id === artifactId).length;
  return Math.max(0, quantity - equippedCopies);
}

export function isArmoryTradeExpired(expiresAt: Date | string, now = new Date()) {
  return new Date(expiresAt).getTime() <= now.getTime();
}
