const FAN_PICK_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Confirmed',
  WON: 'Correct Pick',
  LOST: 'Pick Did Not Match',
  VOID: 'EMIC Restored',
};

const FAN_PICK_WINDOW_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Fan Picks Open',
  CLOSED: 'Awaiting Official Result',
  SETTLED: 'Completed',
  VOID: 'EMIC Restored',
};

export function formatRewardLabel(multiplier: string) {
  const parsed = Number(multiplier.trim().replace(/[x×]$/i, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return 'Reward';

  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(parsed);
  return `${formatted}× Reward`;
}

export function fanPickStatusLabel(status: string) {
  const normalized = status.trim().toUpperCase();
  return FAN_PICK_STATUS_LABELS[normalized] ?? 'Status Unavailable';
}

export function fanPickWindowStatusLabel(status: string) {
  const normalized = status.trim().toUpperCase();
  return FAN_PICK_WINDOW_STATUS_LABELS[normalized] ?? 'Fan Picks Unavailable';
}

export function resolvedRewardLabel(status: string) {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'WON') return 'Reward Credited';
  if (normalized === 'LOST') return 'No Reward Credited';
  if (normalized === 'VOID') return 'EMIC Restored';
  return 'Potential Reward';
}

export function emicRewardCategoryLabel(itemType: string, fallbackCategory = '') {
  const normalized = itemType.trim().toUpperCase();
  if (normalized === 'HOUR_PASS') return 'Gaming Passes';
  if (normalized === 'DRINK') return 'Food & Drink Rewards';
  if (normalized === 'GUILD_MEMBERSHIP') return 'Guild Membership Rewards';
  return fallbackCategory.trim() || 'EMIC Reward';
}
