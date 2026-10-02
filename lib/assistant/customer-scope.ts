import { isBookingStartPastInIndia } from '@/lib/public-booking-time';

// This flag can only remove privileges. It never grants access or replaces authentication.
export function customerScopedAdmin(role: string | undefined, headers: Pick<Headers, 'get'>) {
  return role === 'ADMIN' && headers.get('x-emiguild-customer-scope') !== '1';
}
export function canCancelOwnBooking(booking: { userId: string | null; date: string; startTime: string; status: string }, userId: string, now = new Date()) {
  return booking.userId === userId && ['PENDING', 'CONFIRMED'].includes(booking.status)
    && !isBookingStartPastInIndia(booking.date, booking.startTime, now, 0);
}
