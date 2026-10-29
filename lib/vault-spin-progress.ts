export type VaultLegendary = { enabled: boolean; current: number; target: number; spinsRemaining: number };

export function vaultLegendaryDisplay(legendary?: VaultLegendary) {
  if (!legendary?.enabled) return null;
  const current = Math.max(0, Math.min(30, legendary.current));
  return {
    current,
    remaining: 30 - current,
    label: current >= 29 ? 'Legendary on your next eligible spin.' : `${30 - current} days left`,
    width: `${current / 30 * 100}%`,
  };
}
