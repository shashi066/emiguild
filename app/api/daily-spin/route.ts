import { auth } from '@/auth';
import { z } from 'zod';
import { getEffectiveSpinDate, getSpinSettings, getSpinState } from '@/lib/daily-spin';
import { performDailySpin } from '@/lib/spin-rewards';
import { publicSpinFailure, serializeSpinResult, serializeSpinStatus } from '@/lib/spin-public';
import { verifyActionToken } from '@/lib/assistant/tokens';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requestIdSchema, requireOrigin, RewardError } from '@/lib/november';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Unauthorized' }, 401);
  try {
    const state = await getSpinState(session.user.id);
    return lifecycleJson(serializeSpinStatus(state));
  } catch (error) { return publicSpinFailure(error); }
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
    return lifecycleJson(serializeSpinResult(await performDailySpin(session.user.id, input)));
  } catch (error) { return publicSpinFailure(error); }
}
