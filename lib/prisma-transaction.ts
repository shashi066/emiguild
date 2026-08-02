import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function runSerializableTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'P2034'
      );
      if (!retryable || attempt === 2) throw error;
    }
  }

  throw new Error('Serializable transaction retry limit reached.');
}
