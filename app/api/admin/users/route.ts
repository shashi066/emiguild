import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { encryptPhone } from '@/lib/crypto';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, email: true, phone: true,
      role: true, createdAt: true,
      _count: { select: { bookings: true } },
    },
  });

  const encryptedUsers = users.map((user) => ({
    ...user,
    phone: encryptPhone(user.phone),
  }));

  return NextResponse.json({ users: encryptedUsers });
}
