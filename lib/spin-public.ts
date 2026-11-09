import { z } from 'zod';
import { encryptNumber } from './crypto';
import type { getSpinState } from './daily-spin';
import { lifecycleJson } from './lifecycle/http';
import { RewardError, rewardFailure } from './november';

// Explicit public contracts: internal records and saved receipts stay intact.
const reward = z.object({
  id: z.string(), name: z.string(), description: z.string().nullable().optional(),
  iconUrl: z.string().nullable().optional(), rarity: z.string().nullable().optional(),
});
const spinRecord = z.object({
  id: z.string(), spinDate: z.string(), attempts: z.number().int(),
  createdAt: z.union([z.string(), z.date()]).optional(), lootItem: reward.nullable(),
});
const streak = z.object({ current: z.number(), target: z.number(), guaranteedToday: z.boolean(), spinsRemaining: z.number() });
const legendary = z.object({ enabled: z.boolean(), current: z.number(), target: z.number(), spinsRemaining: z.number() });
const result = z.object({
  success: z.boolean(), reward: reward.nullable(), spinRecord, streak, legendary,
  remainingRetries: z.literal(0), streakReward: z.boolean(), nextReset: z.string(),
  recovered: z.boolean().optional(),
});

export function serializeSpinStatus(state: Awaited<ReturnType<typeof getSpinState>>) {
  return {
    enabled: state.settings.enabled, canSpin: state.canSpin, spinDate: state.spinDate,
    spin: state.spin ? spinRecord.parse(state.spin) : null,
    streak: streak.parse(state.streak), legendary: legendary.parse(state.legendary),
    remainingRetries: 0, nextReset: state.nextReset.toISOString(),
    lootItems: state.items.map(item => ({ ...reward.parse(item), weight: encryptNumber(item.weight) })),
  };
}

export function serializeSpinResult(saved: unknown) {
  const parsed = result.safeParse(saved);
  if (!parsed.success) throw new Error('Invalid saved Spin result');
  return parsed.data;
}

export function publicSpinFailure(error: unknown) {
  if (error instanceof RewardError && ['INVALID_SELECTION_CONFIG', 'SELECTED_REWARD_UNAVAILABLE'].includes(error.code)) {
    console.error('daily_spin_configuration_unavailable', { code: error.code });
    return lifecycleJson({ error: 'Daily spin is temporarily unavailable. Your spin is unused.', code: 'SPIN_UNAVAILABLE' }, 503);
  }
  return rewardFailure(error);
}
