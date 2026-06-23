import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

const PASS_CONFIG = {
  BRONZE: { totalHours: 10, price: 1300 },
} as const;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { pathname } = req.nextUrl;
    // Expect pathname like: /api/admin/draws/:id/pick-winner
    const m = pathname.match(/\/api\/admin\/draws\/([^\/]+)\/pick-winner\/?$/);
    const id = m ? m[1] : null;
    if (!id) return NextResponse.json({ error: 'Invalid draw id' }, { status: 400 });

    // fetch draw
    const draw = await prisma.draw.findUnique({ where: { id } });
    if (!draw || draw.isDeleted) return NextResponse.json({ error: 'Draw not found' }, { status: 404 });
    if (draw.status !== 'ACTIVE') return NextResponse.json({ error: 'Draw not active' }, { status: 400 });

    const count = await prisma.drawEntry.count({ where: { drawId: id, isDeleted: false } });
    if (count === 0) return NextResponse.json({ error: 'No participants' }, { status: 400 });

    const randomIndex = Math.floor(Math.random() * count);

    // select winner entry using skip/take
    const [winnerEntry] = await prisma.drawEntry.findMany({ where: { drawId: id, isDeleted: false }, skip: randomIndex, take: 1 });
    if (!winnerEntry) return NextResponse.json({ error: 'Failed to pick winner' }, { status: 500 });

    // Mark draw completed and set winnerUserId. Do not create passes automatically; admin will assign passes manually.
    const result = await prisma.$transaction(async (tx) => {
      const updatedDraw = await tx.draw.update({ where: { id }, data: { status: 'COMPLETED', winnerUserId: winnerEntry.userId } });
      return { updatedDraw, winnerEntry };
    });

    // If the client expects JSON (programmatic), return JSON. Otherwise redirect browser to winner-card page.
    const accept = req.headers.get('accept') || '';
    if (accept.includes('application/json')) {
      return NextResponse.json({ winner: result.winnerEntry });
    }

    const base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const redirectUrl = new URL(`/admin/draws/${id}/winner-card`, base);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  } catch (err) {
    console.error('[/api/admin/draws/[id]/pick-winner POST] error:', err);
    return NextResponse.json({ error: 'Failed to pick winner' }, { status: 500 });
  }
}
