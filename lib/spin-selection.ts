import { z } from 'zod';
import { prisma } from './prisma';
import { audit, requireCurrentUser, RewardError, rewardTransaction, type RewardTx } from './november';

export const SPIN_SELECTION_KEY = 'daily_spin_selection';
const selectionSchema = z.object({ enabled: z.boolean(), itemId: z.string().min(1).max(100).nullable(), version: z.number().int().min(0) }).strict();
export type SpinSelection = z.infer<typeof selectionSchema>;
export const spinSelectionInput = selectionSchema.refine(value => !value.enabled || !!value.itemId, 'Choose a reward.');
export const spinItemInput = z.object({
  name: z.string().trim().min(1).max(150), description: z.string().max(1000).nullable().optional(),
  iconUrl: z.string().max(2000).nullable().optional(), weight: z.coerce.number().int().min(0).max(1_000_000),
  enabled: z.boolean().default(true), rarity: z.enum(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']).nullable().default('COMMON'),
}).strict();

export async function readSpinSelection(db: RewardTx = prisma): Promise<SpinSelection> {
  const row = await db.setting.findUnique({ where: { key: SPIN_SELECTION_KEY }, select: { value: true } });
  if (!row) return { enabled: false, itemId: null, version: 0 };
  try { return selectionSchema.parse(JSON.parse(row.value)); }
  catch { throw new RewardError('INVALID_SELECTION_CONFIG', 'Spin selection needs admin configuration. Your spin is unused.', 503); }
}

export async function configureSpinSelection(actorId: string, input: SpinSelection) {
  const value = spinSelectionInput.parse(input);
  return rewardTransaction(async tx => {
    await requireCurrentUser(actorId, tx, true);
    const previous = await readSpinSelection(tx);
    if (previous.version !== value.version) throw new RewardError('STALE_EDIT', 'Spin selection changed. Refresh first.', 409);
    if (value.enabled) {
      const item = await tx.lootItem.findUnique({ where: { id: value.itemId! } });
      if (!item?.enabled || item.weight <= 0) throw new RewardError('INVALID_REWARD', 'Choose an active reward with a positive weight.', 409);
    }
    const next = { ...value, version: previous.version + 1 };
    await tx.setting.upsert({ where: { key: SPIN_SELECTION_KEY }, create: { key: SPIN_SELECTION_KEY, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
    await audit(tx, actorId, 'SPIN_SELECTION', SPIN_SELECTION_KEY, previous, next);
    return next;
  });
}

/** Item changes and selection read share a transaction, preventing invalidation races. */
export async function mutateSpinItem(actorId: string, id: string | null, input: unknown, remove = false) {
  const data = remove ? null : id ? spinItemInput.partial().parse(input) : spinItemInput.parse(input);
  return rewardTransaction(async tx => {
    await requireCurrentUser(actorId, tx, true);
    const selection = await readSpinSelection(tx);
    if (selection.enabled && selection.itemId === id && (remove || data?.enabled === false || data?.weight === 0)) {
      throw new RewardError('SELECTED_REWARD', 'Disable the selected reward override before removing or disabling this item.', 409);
    }
    if (remove) return tx.lootItem.delete({ where: { id: id! } });
    return id ? tx.lootItem.update({ where: { id }, data: data! }) : tx.lootItem.create({ data: data as z.infer<typeof spinItemInput> });
  });
}
