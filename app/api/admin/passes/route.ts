import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import {
  isGuildMembershipType,
} from '@/lib/guild-membership';
import {
  loadGuildMembershipPlans,
  assignGuildMembership,
  updateGuildMembershipPlan,
} from '@/lib/guild-membership-server';

const PASS_CONFIG = {
  BRONZE: { totalHours: 10, price: 1300, validityDays: 30 },
  SILVER: { totalHours: 20, price: 2300, validityDays: 30 },
  GOLD:   { totalHours: 30, price: 3000, validityDays: 30 },
  BLACK:  { totalHours: 10, price: 2400, validityDays: 30 },
  APEX:   { totalHours: 15, price: 3150, validityDays: 30 },
} as const;

const WATCH_PARTY_TICKET_STATUSES = ['WATCH_PARTY_TICKET', 'WATCH_PARTY_TICKET_GIVEN'];

// GET /api/admin/passes?userId=xxx — get a specific user's active passes
export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (req.nextUrl.searchParams.get('plans') === '1') {
    return NextResponse.json({ plans: await loadGuildMembershipPlans() });
  }

  if (req.nextUrl.searchParams.get('all') === '1') {
    try {
      const now = new Date();
      // First auto-expire any active passes that are past their expiry date
      try {
        await prisma.userPass.updateMany({
          where: { status: 'ACTIVE', expiresAt: { lt: now } },
          data: { status: 'EXPIRED' },
        });
      } catch {
        // Table may not exist yet in local database dev environment
      }

      let activePasses: any[] = [];
      try {
        activePasses = await prisma.userPass.findMany({
          where: { status: 'ACTIVE' },
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true }
            }
          },
          orderBy: { purchasedAt: 'desc' },
        });
      } catch {
        activePasses = [];
      }

      return NextResponse.json({ passes: activePasses });
    } catch (err) {
      console.error('[/api/admin/passes GET?all=1] error:', err);
      return NextResponse.json({ error: 'Failed to fetch active passes.' }, { status: 500 });
    }
  }

  const userId = req.nextUrl.searchParams.get('userId')?.trim();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  const includeHistory = req.nextUrl.searchParams.get('history') === '1';

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
      await prisma.userPass.updateMany({
        where: { userId, status: 'ACTIVE', expiresAt: { lt: now } },
        data: { status: 'EXPIRED' },
      });
      const raw = await prisma.userPass.findMany({
        where: includeHistory
          ? { userId, status: { notIn: WATCH_PARTY_TICKET_STATUSES } }
          : { userId, status: 'ACTIVE', expiresAt: { gte: now } },
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

  if (
    !userId
    || typeof passType !== 'string'
    || (!(passType in PASS_CONFIG) && !isGuildMembershipType(passType))
  ) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const now = new Date();

    if (isGuildMembershipType(passType)) {
      const plans = await loadGuildMembershipPlans();
      const plan = plans.find((candidate) => candidate.type === passType);
      if (!plan?.isActive) {
        return NextResponse.json(
          { error: 'This Guild Membership plan is currently disabled.' },
          { status: 400 }
        );
      }

      const result = await assignGuildMembership({
        userId,
        passType,
        price: plan.price,
        validityDays: plan.validityDays,
        now,
      });
      if (result.existingMembership) {
        return NextResponse.json(
          { error: 'This user already has an active Guild Membership.' },
          { status: 409 }
        );
      }

      return NextResponse.json({ pass: result.pass }, { status: 201 });
    }

    const config = PASS_CONFIG[passType as keyof typeof PASS_CONFIG];
    const expiresAt = new Date(now.getTime() + config.validityDays * 24 * 60 * 60 * 1000);

    const pass = await prisma.userPass.create({
      data: {
        userId,
        passType,
        totalHours: config.totalHours,
        price: config.price,
        expiresAt,
      },
    });

    return NextResponse.json({ pass }, { status: 201 });
  } catch (err) {
    console.error('[/api/admin/passes POST] error:', err);
    return NextResponse.json({ error: 'Failed to assign pass. Please try again.' }, { status: 500 });
  }
}

// PATCH /api/admin/passes — update Guild plans or manage an existing pass
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const action = typeof body.action === 'string' ? body.action : 'revoke';
    if (!['updatePlan', 'extend', 'revoke'].includes(action)) {
      return NextResponse.json({ error: 'Invalid pass action.' }, { status: 400 });
    }

    if (action === 'updatePlan') {
      const { passType, price, validityDays, description, isActive } = body;
      if (
        !isGuildMembershipType(passType)
        || !Number.isInteger(price)
        || price < 1
        || price > 100000
        || !Number.isInteger(validityDays)
        || validityDays < 1
        || validityDays > 365
        || typeof description !== 'string'
        || description.trim().length < 10
        || description.trim().length > 300
        || typeof isActive !== 'boolean'
      ) {
        return NextResponse.json(
          { error: 'Invalid Guild Membership plan settings.' },
          { status: 400 }
        );
      }

      const plan = await updateGuildMembershipPlan(passType, {
        price,
        validityDays,
        description: description.trim(),
        isActive,
      });
      return NextResponse.json({ plan });
    }

    const { passId } = body;
    if (!passId || typeof passId !== 'string') {
      return NextResponse.json({ error: 'passId is required' }, { status: 400 });
    }

    if (action === 'extend') {
      const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return NextResponse.json({ error: 'Extension must be between 1 and 365 days.' }, { status: 400 });
      }
      const existing = await prisma.userPass.findUnique({ where: { id: passId } });
      if (!existing || !isGuildMembershipType(existing.passType)) {
        return NextResponse.json({ error: 'Guild Membership not found.' }, { status: 404 });
      }
      const now = new Date();
      if (existing.status !== 'ACTIVE' || existing.expiresAt < now) {
        return NextResponse.json(
          { error: 'Only an active Guild Membership can be extended. Assign a renewal instead.' },
          { status: 400 }
        );
      }
      const pass = await prisma.userPass.update({
        where: { id: passId },
        data: {
          expiresAt: new Date(existing.expiresAt.getTime() + days * 24 * 60 * 60 * 1000),
        },
      });
      return NextResponse.json({ pass });
    }

    const pass = await prisma.userPass.update({
      where: { id: passId },
      data: { status: 'REVOKED' },
    });

    return NextResponse.json({ pass });
  } catch (err) {
    console.error('[/api/admin/passes PATCH] error:', err);
    return NextResponse.json({ error: 'Failed to update pass or membership. Please try again.' }, { status: 500 });
  }
}
