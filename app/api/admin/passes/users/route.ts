import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { encryptPhone } from '@/lib/crypto';

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
    const encryptedUsers = users.map(u => ({ ...u, phone: encryptPhone(u.phone) }));
    return NextResponse.json({ users: encryptedUsers });
  } catch (err) {
    console.error('[/api/admin/passes/users] DB error:', err);
    return NextResponse.json({ users: [] });
  }
}
