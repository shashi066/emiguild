import { auth } from '@/auth';
import { z } from 'zod';
import { lifecycleJson } from '@/lib/lifecycle/http';
import { requireOrigin, requireCurrentUser, RewardError, rewardFailure, rewardTransaction } from '@/lib/november';
import { validBookingPayment } from '@/lib/payment-verification';
const schema = z.object({ bookingId: z.string().min(1), razorpay_order_id: z.string().min(1).max(100), razorpay_payment_id: z.string().min(1).max(100), razorpay_signature: z.string().regex(/^[a-f\d]{64}$/i) }).strict();
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return lifecycleJson({ error: 'Unauthorized' }, 401);
  try {
    requireOrigin(request);
    const input = schema.parse(await request.json());
    const booking = await rewardTransaction(async tx => {
      await requireCurrentUser(session.user.id, tx);
      const row = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!row || row.userId !== session.user.id) throw new RewardError('NOT_FOUND', 'Booking not found.', 404);
      if (!validBookingPayment({ storedOrderId: row.razorpayOrderId, orderId: input.razorpay_order_id, paymentId: input.razorpay_payment_id, signature: input.razorpay_signature, secret: process.env.RAZORPAY_KEY_SECRET ?? '' })) throw new RewardError('INVALID_PAYMENT', 'Payment does not match this booking.');
      if (row.paymentStatus === 'PAID') {
        if (row.razorpayPaymentId !== input.razorpay_payment_id) throw new RewardError('ALREADY_PAID', 'This booking is already paid.', 409);
        return tx.booking.findUniqueOrThrow({ where: { id: row.id }, include: { station: { select: { id: true, name: true } } } });
      }
      if (!['PENDING', 'CONFIRMED'].includes(row.status)) throw new RewardError('BOOKING_ENDED', 'This booking can no longer accept payment.', 409);
      const reused = await tx.booking.findFirst({ where: { razorpayPaymentId: input.razorpay_payment_id, id: { not: row.id } }, select: { id: true } });
      if (reused) throw new RewardError('PAYMENT_USED', 'This payment is already linked to another booking.', 409);
      return tx.booking.update({ where: { id: row.id }, data: { status: 'CONFIRMED', paymentStatus: 'PAID', razorpayPaymentId: input.razorpay_payment_id }, include: { station: { select: { id: true, name: true } } } });
    });
    return lifecycleJson({ booking, success: true });
  } catch (error) { return rewardFailure(error); }
}
