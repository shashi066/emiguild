import { z } from 'zod';

export const PS5_RENTAL_STATUSES = ['AVAILABLE', 'COMING_SOON', 'DISABLED'] as const;
export type Ps5RentalAvailability = (typeof PS5_RENTAL_STATUSES)[number];

export const PS5_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'DELIVERED', 'RETURNED', 'CANCELLED'] as const;
export type Ps5RentalOrderStatus = (typeof PS5_ORDER_STATUSES)[number];

export const ACTIVE_PS5_RENTAL_STATUSES: Ps5RentalOrderStatus[] = ['PENDING', 'CONFIRMED', 'DELIVERED'];

export const PS5_RENTAL_TRANSITIONS: Record<Ps5RentalOrderStatus, readonly Ps5RentalOrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['RETURNED'],
  RETURNED: [],
  CANCELLED: [],
};

export function resolvePs5RentalAvailability(settings: Record<string, string | undefined>): Ps5RentalAvailability {
  const status = settings.ps5_rental_status;
  if (PS5_RENTAL_STATUSES.includes(status as Ps5RentalAvailability)) return status as Ps5RentalAvailability;
  if (settings.ps5_rental_enabled === 'true') return 'AVAILABLE';
  if (settings.ps5_rental_enabled === 'false') return 'DISABLED';
  return 'COMING_SOON';
}

export function parsePs5RentalPrice(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 100_000 ? parsed : fallback;
}

export function calculatePs5RentalTotal(pricePerDay: number, controllerPrice: number, days: number, extraControllers: number) {
  return (pricePerDay + controllerPrice * extraControllers) * days;
}

export function canTransitionPs5Rental(from: string, to: string): boolean {
  if (!PS5_ORDER_STATUSES.includes(from as Ps5RentalOrderStatus)) return false;
  return PS5_RENTAL_TRANSITIONS[from as Ps5RentalOrderStatus].includes(to as Ps5RentalOrderStatus);
}

export const createPs5RentalSchema = z.object({
  rentalDays: z.number().int().min(1).max(30),
  extraControllers: z.number().int().min(0).max(3),
  selectedGameIds: z.array(z.string().min(1)).min(1).max(5).refine((ids) => new Set(ids).size === ids.length, 'Games must be unique'),
  customerName: z.string().trim().min(1).max(100),
  customerPhone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number'),
  deliveryAddress: z.string().trim().min(5).max(500),
  deliveryCity: z.string().trim().min(1).max(100),
  deliveryPincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit pincode'),
  deliveryNotes: z.string().trim().max(500).optional(),
  acceptedTerms: z.literal(true),
});
