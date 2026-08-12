export const PREDICTION_ODDS_PATTERN = /^(?:[1-9](?:\.\d{1,2})?|10(?:\.0{1,2})?)$/;

export function predictionOddsBasisPoints(value: string) {
  const trimmed = value.trim();
  if (!PREDICTION_ODDS_PATTERN.test(trimmed)) return null;

  const multiplier = Number(trimmed);
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 10) return null;
  return Math.round(multiplier * 10_000);
}

export function possibleEmicReturn(stakeCoins: number, multiplier: string) {
  const parsedMultiplier = Number(multiplier.replace(/x$/i, ''));
  const safeMultiplier = Number.isFinite(parsedMultiplier) && parsedMultiplier > 0
    ? parsedMultiplier
    : 1;
  const stakeUnits = Math.round(stakeCoins * 10);
  const multiplierBasisPoints = Math.round(safeMultiplier * 10_000);
  return Math.floor((stakeUnits * multiplierBasisPoints) / 10_000) / 10;
}
