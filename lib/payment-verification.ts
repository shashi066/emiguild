import { createHmac, timingSafeEqual } from 'node:crypto';
export function validBookingPayment(input: { storedOrderId: string | null; orderId: string; paymentId: string; signature: string; secret: string }) {
  if (!input.secret || !input.storedOrderId || input.storedOrderId !== input.orderId || !/^[a-f\d]{64}$/i.test(input.signature)) return false;
  const expected = createHmac('sha256', input.secret).update(`${input.orderId}|${input.paymentId}`).digest();
  return timingSafeEqual(expected, Buffer.from(input.signature, 'hex'));
}
