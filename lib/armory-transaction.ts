import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export async function armoryTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt >= 3 || !['P2034', 'P1008', 'P2002'].includes(code ?? '')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}
