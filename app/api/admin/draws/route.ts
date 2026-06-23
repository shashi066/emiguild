import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// GET: list draws (admin)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const draws = await prisma.draw.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      include: { entries: { where: { isDeleted: false } } },
    });

    // include participants count
    const data = draws.map((d) => ({ ...d, participantsCount: d.entries?.length ?? 0 }));
    return NextResponse.json({ draws: data });
  } catch (err) {
    console.error('[/api/admin/draws GET] error:', err);
    return NextResponse.json({ error: 'Failed to fetch draws' }, { status: 500 });
  }
}

// POST: create draw
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { title, description, prizeName, startAt, endAt, status } = body;
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  try {
    const draw = await prisma.draw.create({
      data: { title, description, prizeName, startAt: startAt ? new Date(startAt) : null, endAt: endAt ? new Date(endAt) : null, status: status ?? 'DRAFT' },
    });

    return NextResponse.json({ draw }, { status: 201 });
  } catch (err) {
    console.error('[/api/admin/draws POST] error:', err);
    return NextResponse.json({ error: 'Failed to create draw' }, { status: 500 });
  }
}
