export const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
export const DAY = 24 * 60 * 60 * 1000;

export type MessagingSettings = {
  comebackEmail: boolean;
  emailDigest: boolean;
};
export type VaultItem = {
  id: string;
  kind: 'reward' | 'token' | 'forge' | 'spin' | 'progress';
  sourceRef: string;
  title: string;
  description: string;
  href: string;
  action: string;
  validUntil: string;
  expires: boolean;
};
export type GameId = 'guess36' | 'spin' | 'artifacts' | 'tower' | 'guild-drop' | 'watch-party' | 'tournaments';
export type GameProgress = {
  id: GameId;
  title: string;
  facts?: {
    guessPicks?: { today: string | null; yesterday: string | null; result: number | null };
    review?: { claimed: boolean; nextResetAt: string; serverNow: string };
    tokenCount?: number;
    tokenExpiries?: string[];
    ownedArtifacts?: number;
    dailyAvailable?: boolean;
    usedToday?: boolean;
    rewardName?: string;
    canClaim?: boolean;
    slots?: Array<{ slot: string; name: string | null }>;
    goals?: Array<{ id: string; title: string; current: number; total: number; reward: string; missingOwned?: number; needsEquipment?: boolean }>;
    events?: Array<{ id: string; title: string; participation: string; at?: string }>;
  };
  status: 'available' | 'active' | 'completed' | 'empty' | 'disabled' | 'error';
  summary: string;
  details: string[];
  progress?: { current: number; total: number; label: string };
  deadline?: { at: string; label: string };
  href: string;
  action: string;
};
export type AccountState = { userId: string; evaluatedAt: string; items: VaultItem[]; games: GameProgress[]; rewardsUnavailable?: boolean };
export type EmailCampaign = 'DIGEST' | 'COMEBACK';
export type ActivityWindow = {
  start: string; end: string; spin: number; forge: number; guess36: number;
  reliable: boolean; featuresEnabled: boolean;
};
export type MessageCandidate = {
  campaign: EmailCampaign; subject: string; text: string; href: '/vault';
  sourceRefs: string[]; validUntil: string; window?: ActivityWindow;
};
export type SuppressionReason = 'CHANNEL_DISABLED' | 'CHANNEL_UNAVAILABLE' | 'RECENT_VISIT' | 'FREQUENCY_CAP' | 'NO_ELIGIBLE_ITEMS'
  | 'UNSUBSCRIBED' | 'ACCOUNT_TOO_NEW' | 'ACTIVITY_FOUND'
  | 'FEATURE_DISABLED' | 'HISTORY_UNAVAILABLE' | 'CHECK_NOT_DUE' | 'DIGEST_NOT_DUE' | 'PENDING_DELIVERY' | 'TRANSPORT_UNAVAILABLE';
export type DeliveryHistory = Array<{ campaign: EmailCampaign; status: string; at: string }>;
export type ChannelPreview = { candidate: MessageCandidate | null; eligible: boolean; suppressionReasons: SuppressionReason[] };
export type LifecyclePreview = {
  state: AccountState; digest: ChannelPreview; comeback: ChannelPreview; selected: EmailCampaign | null;
  activity: ActivityWindow; nextComebackCheckAt: string | null; history: DeliveryHistory; deliveryEnabled: boolean;
};
export function hasUsableEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
export function formatVaultTime(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' IST';
}

export function formatEndOfDay(value: string) {
  // Deadlines are exclusive. Moving back one millisecond makes a midnight reset
  // read as the end of the day that the player can still use the item.
  return new Date(Date.parse(value) - 1).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
  }) + ' (end of day)';
}

export function orderVaultItems(items: VaultItem[], now: Date) {
  return items.filter((item) => Date.parse(item.validUntil) > now.getTime()).sort((a, b) =>
    Number(b.expires) - Number(a.expires)
    || (a.expires ? Date.parse(a.validUntil) - Date.parse(b.validUntil) : 0)
    || a.id.localeCompare(b.id));
}

export function digestPeriod(now: Date) {
  const shifted = new Date(now.getTime() + 330 * 60_000);
  const day = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 18));
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  if (day.getTime() > shifted.getTime()) day.setUTCDate(day.getUTCDate() - 7);
  return new Date(day.getTime() - 330 * 60_000);
}
export type EvaluationInput = {
  state: AccountState; settings: MessagingSettings; email: string;
  unsubscribed: boolean;
  createdAt: string; lastWebsiteVisitAt: string | null; nextComebackCheckAt: string | null;
  activity: ActivityWindow; now: Date; history: DeliveryHistory; transportAvailable: boolean;
  ignoreSchedule?: boolean;
};
export function evaluateLifecycle(input: EvaluationInput): LifecyclePreview {
  const { now, state, settings, activity, history } = input;
  const items = orderVaultItems(state.items, now);
  const digest: MessageCandidate | null = items.length ? {
    campaign: 'DIGEST', subject: 'Your Vault has something for you',
    text: 'Don’t leave these behind.\n\n' + items.map((item) =>
      `${item.title} — ${item.description} Available through ${formatEndOfDay(item.validUntil)}.`).join('\n'),
    href: '/vault', sourceRefs: items.map((item) => item.sourceRef), validUntil: new Date(Math.min(...items.map((item) => Date.parse(item.validUntil)))).toISOString(),
  } : null;
  const opportunities = state.games.filter((game) => ['spin', 'artifacts', 'guess36'].includes(game.id)
    && game.status === 'available' && (game.id === 'guess36' || game.facts?.dailyAvailable)
    && game.deadline && Date.parse(game.deadline.at) > now.getTime());
  const comeback: MessageCandidate | null = opportunities.length ? {
    campaign: 'COMEBACK', subject: 'Your next EmiGuild move is ready',
    text: 'Jump back in.\n\n' + opportunities.map((game) =>
      `${game.id === 'spin' ? 'Daily Spin — Spin for today’s reward' : game.id === 'artifacts' ? 'Daily Forge — Discover an artifact' : 'Guess 36 — Make today’s pick'}. Available through ${formatEndOfDay(game.deadline!.at)}.`).join('\n'),
    href: '/vault', sourceRefs: opportunities.map((game) => `Opportunity:${game.id}:${game.deadline!.at}`),
    validUntil: new Date(Math.min(...opportunities.map((game) => Date.parse(game.deadline!.at)))).toISOString(), window: activity,
  } : null;
  const common: SuppressionReason[] = [];
  if (!input.transportAvailable) common.push('TRANSPORT_UNAVAILABLE');
  if (!hasUsableEmail(input.email)) common.push('CHANNEL_UNAVAILABLE');
  if (input.unsubscribed) common.push('UNSUBSCRIBED');
  if (input.lastWebsiteVisitAt && now.getTime() - Date.parse(input.lastWebsiteVisitAt) < 3 * DAY) common.push('RECENT_VISIT');
  if (history.some((row) => ['ACCEPTED', 'UNKNOWN'].includes(row.status)
    && Date.parse(row.at) > now.getTime() - 7 * DAY && Date.parse(row.at) <= now.getTime())) common.push('FREQUENCY_CAP');
  if (history.some((row) => ['SENDING'].includes(row.status))) common.push('PENDING_DELIVERY');
  const digestReasons = [...common];
  if (!settings.emailDigest) digestReasons.push('CHANNEL_DISABLED');
  if (!input.ignoreSchedule && digestPeriod(now).getTime() < Date.parse(input.createdAt)) digestReasons.push('DIGEST_NOT_DUE');
  if (!digest) digestReasons.push('NO_ELIGIBLE_ITEMS');
  const comebackReasons = [...common];
  if (!settings.comebackEmail) comebackReasons.push('CHANNEL_DISABLED');
  if (now.getTime() - Date.parse(input.createdAt) < 3 * DAY) comebackReasons.push('ACCOUNT_TOO_NEW');
  if (!input.ignoreSchedule && input.nextComebackCheckAt && Date.parse(input.nextComebackCheckAt) > now.getTime()) comebackReasons.push('CHECK_NOT_DUE');
  if (!activity.reliable) comebackReasons.push('HISTORY_UNAVAILABLE');
  if (!activity.featuresEnabled) comebackReasons.push('FEATURE_DISABLED');
  if (activity.spin || activity.forge || activity.guess36) comebackReasons.push('ACTIVITY_FOUND');
  if (!comeback) comebackReasons.push('NO_ELIGIBLE_ITEMS');
  return {
    state: { ...state, items }, activity, history, nextComebackCheckAt: input.nextComebackCheckAt, deliveryEnabled: input.transportAvailable,
    digest: { candidate: digest, eligible: !digestReasons.length, suppressionReasons: digestReasons },
    comeback: { candidate: comeback, eligible: !comebackReasons.length, suppressionReasons: comebackReasons },
    selected: !comebackReasons.length ? 'COMEBACK' : !digestReasons.length ? 'DIGEST' : null,
  };
}
