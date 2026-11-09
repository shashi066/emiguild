import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Wakes this server instance, Prisma and the database before a player reaches a game, so the first
// game action does not pay the cold-start cost. Returns no data.
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new Response(null, { status: 204, headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
