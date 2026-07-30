import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
    transactionOptions: {
      // Prisma's 2s/5s interactive-transaction defaults are too short for a
      // cold serverless database connection. Armory writes deliberately use
      // interactive transactions so inventory, tickets, and Gems stay atomic.
      maxWait: 10_000,
      timeout: 20_000,
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
