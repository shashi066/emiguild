import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canUseAssistant } from '@/lib/assistant/access';
import { quoteBooking } from '@/lib/assistant/quote';
import { createActionToken, quoteFingerprint, verifyActionToken } from '@/lib/assistant/tokens';
import { recordAssistantUsage } from '@/lib/assistant/usage';
import { prisma } from '@/lib/prisma';
import { canCancelOwnBooking } from '@/lib/assistant/customer-scope';
import { dateLabel, timeLabel } from '@/lib/assistant/flow-state';

export const runtime = 'nodejs';

function validOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  return origin === new URL(req.url).origin;
}

async function customerFetch(req: NextRequest, path: string, init: RequestInit) {
  const response = await fetch(new URL(path, req.url), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      cookie: req.headers.get('cookie') ?? '',
      'x-emiguild-customer-scope': '1',
    },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({ error: 'Invalid server response.' }));
  return { response, data };
}

export async function POST(req: NextRequest) {
  if (!validOrigin(req)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Customer sign-in required.' }, { status: 401 });
  }
  if (!await canUseAssistant(session.user)) {
    return NextResponse.json({ error: 'The assistant is not enabled for this account.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { token?: unknown } | null;
  if (!body || typeof body.token !== 'string' || body.token.length > 10_000) {
    return NextResponse.json({ error: 'A confirmation token is required.' }, { status: 400 });
  }

  try {
    const action = verifyActionToken(body.token);
    if (action.userId !== session.user.id) {
      return NextResponse.json({ error: 'This confirmation belongs to another account.' }, { status: 403 });
    }

    if (action.action === 'BOOKING') {
      if (await prisma.booking.findUnique({ where: { id: `assistant-${action.jti}` }, select: { id: true } })) {
        return NextResponse.json({ error: 'This booking was already confirmed. Check My Bookings.' }, { status: 409 });
      }
      const { response, data } = await customerFetch(req, '/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-assistant-confirmation': body.token }, body: JSON.stringify({
          ...action.draft,
          notes: action.draft.notes ?? '',
        }),
      });
      if (response.status === 409 && data.code === 'QUOTE_STALE') {
        const refreshedQuote = await quoteBooking(session.user.id, action.draft);
        return NextResponse.json({ code: 'QUOTE_STALE', error: 'The quote changed. Please review it again.', card: {
          id: crypto.randomUUID(), kind: 'booking_confirmation', title: 'Review updated booking', data: { quote: refreshedQuote },
          actionToken: createActionToken({ action: 'BOOKING', userId: session.user.id, draft: action.draft, quoteHash: quoteFingerprint(refreshedQuote) }),
          actionLabel: 'Confirm updated booking',
        } }, { status: 409 });
      }
      if (!response.ok) return NextResponse.json(data, { status: response.status });
      await recordAssistantUsage(`user:${session.user.id}`, { completedActions: 1 });
      return NextResponse.json({
        success: true,
        card: {
          id: crypto.randomUUID(), kind: 'result', title: 'Booking confirmed',
          description: `${data.booking.station.name} · ${dateLabel(data.booking.date)} · ${timeLabel(data.booking.startTime)}–${timeLabel(data.booking.endTime)} IST`,
          data: { booking: data.booking },
        },
      });
    }

    if (action.action === 'CANCELLATION') {
      const owned = await prisma.booking.findFirst({ where: { id: action.bookingId, userId: session.user.id } });
      if (!owned || !canCancelOwnBooking(owned, session.user.id)) {
        return NextResponse.json({ error: 'This booking cannot be cancelled.' }, { status: 409 });
      }
      const { response, data } = await customerFetch(req, `/api/bookings/${encodeURIComponent(action.bookingId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CANCELLED' }),
      });
      if (!response.ok) return NextResponse.json(data, { status: response.status });
      await recordAssistantUsage(`user:${session.user.id}`, { completedActions: 1 });
      const restoredHours = Math.max(0, Number(data.booking?.passHoursDeducted ?? 0));
      return NextResponse.json({
        success: true,
        card: {
          id: crypto.randomUUID(), kind: 'result', title: 'Booking cancelled',
          description: restoredHours > 0
            ? `Your booking was cancelled and ${restoredHours} pass hour${restoredHours === 1 ? '' : 's'} were restored.`
            : 'Your booking was cancelled.',
          data: { booking: data.booking },
        },
      });
    }

    const { response, data } = await customerFetch(req, '/api/daily-spin', { method: 'POST', headers: { 'x-assistant-confirmation': body.token } });
    if (!response.ok) return NextResponse.json(data, { status: response.status === 429 ? 409 : response.status });
    await recordAssistantUsage(`user:${session.user.id}`, { completedActions: 1 });
    return NextResponse.json({
      success: true,
      card: { id: crypto.randomUUID(), kind: 'result', title: 'Daily Spin claimed', description: `You won ${data.reward?.name ?? 'a reward'}!`, data: { reward: data.reward, streakReward: data.streakReward } },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The action could not be completed.';
    await recordAssistantUsage(`user:${session.user.id}`, { errorCount: 1 }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
