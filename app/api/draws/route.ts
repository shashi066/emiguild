import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/draws?activeOnly=true
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const activeOnly = url.searchParams.get('activeOnly') === 'true';

    const where: any = { isDeleted: false };
    if (activeOnly) where.status = 'ACTIVE';

    const draws = await prisma.draw.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, description: true, prizeName: true, startAt: true, endAt: true, status: true },
    });

    return NextResponse.json({ draws });
  } catch (err) {
    console.error('[/api/draws GET] error:', err);
    return NextResponse.json({ error: 'Failed to fetch draws' }, { status: 500 });
  }
}
