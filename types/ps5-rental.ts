import type { Ps5Rental } from '@prisma/client';

export type Rental = Omit<Ps5Rental, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string };
export type AdminRental = Rental & { user: { email: string } };
