import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Best-effort database wake-up before a game. Vercel may serve the game in another instance,
// so this does not guarantee removal of its application cold start. Returns no data.
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new Response(null, { status: 204, headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
