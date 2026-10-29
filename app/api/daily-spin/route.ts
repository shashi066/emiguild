import { auth } from '@/auth';
import { z } from 'zod';
import { encryptNumber } from '@/lib/crypto';
import { getEffectiveSpinDate, getSpinSettings, getSpinState } from '@/lib/daily-spin';
import { performDailySpin } from '@/lib/spin-rewards';
import { verifyActionToken } from '@/lib/assistant/tokens';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requestIdSchema, requireOrigin, RewardError, rewardFailure } from '@/lib/november';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Unauthorized' }, 401);
  try {
    const state = await getSpinState(session.user.id);
    return lifecycleJson({ enabled: state.settings.enabled, canSpin: state.canSpin,
      spinDate: state.spinDate, spin: state.spin, streak: state.streak, legendary: state.legendary,
      remainingRetries: 0, nextReset: state.nextReset.toISOString(),
      lootItems: state.items.map(item => ({ ...item, weight: encryptNumber(item.weight) })) });
  } catch (error) { return rewardFailure(error); }
}
const inputSchema = z.object({ requestId: requestIdSchema.optional(), spinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict();
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Unauthorized' }, 401);
  try {
    requireOrigin(request);
    const text = await request.text();
    const input = inputSchema.parse(text ? JSON.parse(text) : {});
    const confirmation = request.headers.get('x-assistant-confirmation');
    if (confirmation) {
      const action = verifyActionToken(confirmation);
      const { spinDate } = getEffectiveSpinDate((await getSpinSettings()).resetHour);
      if (action.action !== 'DAILY_SPIN' || action.userId !== session.user.id || action.spinDate !== spinDate) {
        throw new RewardError('CONFIRMATION_EXPIRED', 'Spin confirmation expired. Refresh Daily Spin.', 409);
      }
    }
    return lifecycleJson(await performDailySpin(session.user.id, input));
  } catch (error) { return rewardFailure(error); }
}
