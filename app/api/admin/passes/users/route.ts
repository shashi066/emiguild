import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// GET /api/admin/passes/users — lightweight list of all users for client-side search
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const users = await prisma.user.findMany({
      where: { role: 'USER' },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ users });
  } catch (err) {
    console.error('[/api/admin/passes/users] DB error:', err);
    return NextResponse.json({ users: [] });
  }
}
