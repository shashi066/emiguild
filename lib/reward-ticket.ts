export type RewardTicketKind = 'discount' | 'gaming' | 'racing' | 'pass' | 'reward';

export type RewardTicketDisplay = {
  id: string;
  kind: RewardTicketKind;
  label: string;
  value: string;
  description: string;
  origin: string;
  expiry: string;
};

type ArtifactTicket = {
  id: string;
  rewardSnapshot: string;
  set?: { name?: string | null } | null;
};

type TowerTicket = {
  id: string;
  reward: {
    name: string;
    type: 'DISCOUNT' | 'GAMING_TIME' | 'RACING_TIME' | 'PASS';
    value?: number;
    passType?: string;
  };
  expiresAt: string;
};

function parseSnapshot(snapshot: string) {
  try {
    return JSON.parse(snapshot) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatRewardTicketExpiry(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getArtifactRewardTicketDisplay(ticket: ArtifactTicket): RewardTicketDisplay {
  const reward = parseSnapshot(ticket.rewardSnapshot);
  const type = String(reward.rewardType ?? '');
  const base = {
    id: ticket.id,
    description: typeof reward.description === 'string' ? reward.description : 'Artifact reward ticket',
    origin: ticket.set?.name ?? (typeof reward.setName === 'string' ? reward.setName : 'Artifact Set'),
    expiry: 'Expires end of today',
  };

  if (type === 'PERCENT_DISCOUNT') return { ...base, kind: 'discount', label: 'Booking Discount', value: `${numberValue(reward.discountPercentage)}%` };
  if (type === 'FIXED_DISCOUNT') return { ...base, kind: 'discount', label: 'Booking Discount', value: `\u20B9${numberValue(reward.discountAmount)}` };
  if (type === 'GAMING_MINUTES') return { ...base, kind: 'gaming', label: 'Gaming Time', value: `${numberValue(reward.gamingMinutes)} min` };
  if (type === 'RACING_MINUTES') return { ...base, kind: 'racing', label: 'Racing Time', value: `${numberValue(reward.racingMinutes)} min` };
  if (type === 'SQUAD_NIGHT') return { ...base, kind: 'gaming', label: 'Squad Night', value: '1 hr' };
  if (type === 'BRONZE_PASS') return { ...base, kind: 'pass', label: 'Bronze Pass', value: '10 hr' };
  return { ...base, kind: 'reward', label: 'Artifact Reward', value: 'Reward' };
}

export function getTowerRewardTicketDisplay(ticket: TowerTicket): RewardTicketDisplay {
  const reward = ticket.reward;
  const base = {
    id: ticket.id,
    description: reward.name,
    origin: 'Tower of Rewards',
    expiry: `Valid until ${formatRewardTicketExpiry(ticket.expiresAt)}`,
  };

  if (reward.type === 'DISCOUNT') return { ...base, kind: 'discount', label: 'Booking Discount', value: `${reward.value ?? 0}%` };
  if (reward.type === 'GAMING_TIME') return { ...base, kind: 'gaming', label: 'Gaming Time', value: `${reward.value ?? 0} min` };
  if (reward.type === 'RACING_TIME') return { ...base, kind: 'racing', label: 'Racing Time', value: `${reward.value ?? 0} min` };
  const passName = reward.passType
    ? `${reward.passType[0]}${reward.passType.slice(1).toLowerCase()} Pass`
    : 'Pass';
  const passValue = reward.value
    ? reward.value % 60 === 0 ? `${reward.value / 60} hr` : `${reward.value} min`
    : reward.name;
  return { ...base, kind: 'pass', label: passName, value: passValue };
}
