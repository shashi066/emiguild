import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// GET: list participants (public limited view)
// POST: create a draw entry for the authenticated user
export async function GET(req: NextRequest) {
  try {
    const { pathname } = req.nextUrl;
    const parts = pathname.split('/');
    const id = parts[parts.length - 2];

    const entries = await prisma.drawEntry.findMany({
      where: { drawId: id, isDeleted: false },
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, phone: true } } },
    });

    // Map to public view: first name, last initial, phone last4
    const publicList = entries.map((e) => {
      const parts = (e.user?.name || '').split(' ');
      const firstName = parts[0] || '';
      const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : '';
      const phone = e.phone || e.user?.phone || '';
      const phoneLast4 = phone.slice(-4);
      return { id: e.id, firstName, lastInitial, phoneLast4, createdAt: e.createdAt };
    });

    return NextResponse.json({ participants: publicList });
  } catch (err) {
    console.error('[/api/draws/[id]/entries GET] error:', err);
    return NextResponse.json({ error: 'Failed to list participants' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const { pathname } = req.nextUrl;
    const parts = pathname.split('/');
    const id = parts[parts.length - 2];

    // Check draw exists and is ACTIVE
    const draw = await prisma.draw.findUnique({ where: { id } });
    if (!draw || draw.isDeleted || draw.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Draw not available' }, { status: 400 });
    }

    // Prevent duplicate entry
    const existing = await prisma.drawEntry.findFirst({ where: { drawId: id, userId: session.user.id } });
    if (existing) return NextResponse.json({ error: 'Already entered' }, { status: 409 });

    // Use provided phone or user's phone
    const body = await req.json().catch(() => ({}));
    const phone = body.phone || session.user.phone || null;

    const entry = await prisma.drawEntry.create({ data: { drawId: id, userId: session.user.id, phone } });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    console.error('[/api/draws/[id]/entries POST] error:', err);
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
  }
}
