import { z } from 'zod';
import { guidedStateSchema, changeSelection } from './flow-state';
import type { GuidedState } from '@/types/assistant';

const nullableText = { type: ['string', 'null'] };
const nullableNumber = { type: ['number', 'null'] };
export const HANDOFF_TOOL = {
  type: 'function' as const, name: 'show_guided_options', strict: true,
  description: 'Interpret a customer request and open selectable options. This never reads private data or performs an action.',
  parameters: {
    type: 'object', additionalProperties: false,
    properties: {
      task: { type: 'string', enum: ['BOOK', 'NEXT', 'BOOKINGS', 'SPIN', 'GAMES', 'PRICES', 'UNSUPPORTED'] },
      stationQuery: nullableText, date: nullableText, startTime: nullableText, duration: nullableNumber,
      extraControllers: nullableNumber, notes: nullableText, quantity: nullableNumber, afterTime: nullableText,
    },
    required: ['task', 'stationQuery', 'date', 'startTime', 'duration', 'extraControllers', 'notes', 'quantity', 'afterTime'],
  },
};
export const intentSchema = z.object({
  task: z.enum(['BOOK', 'NEXT', 'BOOKINGS', 'SPIN', 'GAMES', 'PRICES', 'UNSUPPORTED']),
  stationQuery: z.string().max(80).nullable(), date: z.string().nullable(), startTime: z.string().nullable(),
  duration: z.number().nullable(), extraControllers: z.number().nullable(), notes: z.string().max(160).nullable(),
  quantity: z.number().nullable(), afterTime: z.string().nullable(),
}).strict();

export function intentToState(raw: unknown, previous?: GuidedState): GuidedState | null {
  const intent = intentSchema.parse(raw);
  if (intent.task === 'UNSUPPORTED') return null;
  let state: GuidedState = previous?.task === intent.task ? { ...previous } : { task: intent.task };
  if (intent.stationQuery && intent.stationQuery !== state.stationQuery) state = changeSelection(state, 'stationId');
  if (intent.date && intent.date !== state.date) state = changeSelection(state, 'date');
  if (intent.startTime && intent.startTime !== state.startTime) state = changeSelection(state, 'startTime');
  if (intent.duration && intent.duration !== state.duration) state = changeSelection(state, 'duration');
  if (intent.extraControllers !== null && intent.extraControllers !== state.extraControllers) state = changeSelection(state, 'extraControllers');
  for (const [key, value] of Object.entries(intent)) if (value !== null) state = { ...state, [key]: value };
  delete state.benefitMode; delete state.hourPassId; delete state.appliedBenefitType;
  delete state.bookingId; delete state.cancel;
  if (intent.notes !== null) state.gameChosen = true;
  if (state.task === 'NEXT') { state.search = true; state.offset = 0; }
  if (state.task === 'BOOK' && (state.quantity ?? 1) > 1) { state.task = 'NEXT'; state.search = true; state.afterTime = state.startTime; }
  return guidedStateSchema.parse(state);
}
