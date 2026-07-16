import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

const PASS_CONFIG = {
  BRONZE: { totalHours: 10, price: 1300 },
  SILVER: { totalHours: 20, price: 2300 },
  GOLD:   { totalHours: 30, price: 3000 },
  BLACK:  { totalHours: 10, price: 2400 },
  APEX:   { totalHours: 15, price: 3150 },
} as const;

// GET /api/admin/passes?userId=xxx — get a specific user's active passes
export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get('userId')?.trim();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  try {
    // Step 1: fetch user — only hits the `users` table, always works
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!user) return NextResponse.json({ user: null, passes: [] });

    // Step 2: fetch passes separately — may fail locally if table not yet migrated
    let passes: object[] = [];
    try {
      const now = new Date();
      const raw = await prisma.userPass.findMany({
        where: { userId, status: 'ACTIVE', expiresAt: { gte: now } },
        orderBy: { purchasedAt: 'desc' },
      });
      passes = raw;
    } catch {
      // user_passes table doesn't exist in local dev — return empty list
      passes = [];
    }

    return NextResponse.json({ user, passes });
  } catch (err) {
    console.error('[/api/admin/passes GET] error:', err);
    return NextResponse.json({ error: 'Failed to fetch user.' }, { status: 500 });
  }
}

// POST /api/admin/passes — assign pass to user
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId, passType } = await req.json();

  if (!userId || !passType || !(passType in PASS_CONFIG)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const config = PASS_CONFIG[passType as keyof typeof PASS_CONFIG];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const pass = await prisma.userPass.create({
      data: { userId, passType, totalHours: config.totalHours, price: config.price, expiresAt },
    });

    return NextResponse.json({ pass }, { status: 201 });
  } catch (err) {
    console.error('[/api/admin/passes POST] error:', err);
    return NextResponse.json({ error: 'Failed to assign pass. Please try again.' }, { status: 500 });
  }
}

// PATCH /api/admin/passes — revoke an existing pass
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { passId } = await req.json();
  if (!passId || typeof passId !== 'string') {
    return NextResponse.json({ error: 'passId is required' }, { status: 400 });
  }

  try {
    const pass = await prisma.userPass.update({
      where: { id: passId },
      data: { status: 'REVOKED' },
    });

    return NextResponse.json({ pass });
  } catch (err) {
    console.error('[/api/admin/passes PATCH] error:', err);
    return NextResponse.json({ error: 'Failed to revoke pass. Please try again.' }, { status: 500 });
  }
}
