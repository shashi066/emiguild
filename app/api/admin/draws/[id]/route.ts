import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { pathname } = req.nextUrl;
    const m = pathname.match(/\/api\/admin\/draws\/([^\/]+)\/?$/);
    const id = m ? m[1] : null;
    if (!id) return NextResponse.json({ error: 'Invalid draw id' }, { status: 400 });

    const draw = await prisma.draw.findUnique({ where: { id }, include: { entries: { where: { isDeleted: false }, include: { user: { select: { id: true, name: true, email: true, phone: true } } } } } });
    if (!draw) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ draw });
  } catch (err) {
    console.error('[/api/admin/draws/[id] GET] error:', err);
    return NextResponse.json({ error: 'Failed to fetch draw' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { pathname } = req.nextUrl;
    const m = pathname.match(/\/api\/admin\/draws\/([^\/]+)\/?$/);
    const id = m ? m[1] : null;
    if (!id) return NextResponse.json({ error: 'Invalid draw id' }, { status: 400 });

    const body = await req.json();
    const data: any = {};
    if (body.title) data.title = body.title;
    if (body.description) data.description = body.description;
    if (body.prizeName) data.prizeName = body.prizeName;
    if (body.startAt) data.startAt = new Date(body.startAt);
    if (body.endAt) data.endAt = new Date(body.endAt);
    if (body.status) data.status = body.status;
    // no awarded pass fields — prizeName is free text; passes are assigned manually

    const draw = await prisma.draw.update({ where: { id }, data });
    return NextResponse.json({ draw });
  } catch (err) {
    console.error('[/api/admin/draws/[id] PATCH] error:', err);
    return NextResponse.json({ error: 'Failed to update draw' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { pathname } = req.nextUrl;
    const m = pathname.match(/\/api\/admin\/draws\/([^\/]+)\/?$/);
    const id = m ? m[1] : null;
    if (!id) return NextResponse.json({ error: 'Invalid draw id' }, { status: 400 });

    const draw = await prisma.draw.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/admin/draws/[id] DELETE] error:', err);
    return NextResponse.json({ error: 'Failed to delete draw' }, { status: 500 });
  }
}
