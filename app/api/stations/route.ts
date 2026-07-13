import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  const isAdmin = session?.user?.role === 'ADMIN';
  
  // Admin gets all stations, public users only get active ones
  const stations = await prisma.station.findMany({
    where: isAdmin ? {} : { isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      specs: true,
      hourlyRate: true,
      minDuration: true,
      hasControllers: true,
      imageUrl: true,
      isActive: true,
      position: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { position: 'asc' },
  });
  return NextResponse.json({ stations });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, specs, hourlyRate, position, minDuration, hasControllers } = body;

  if (!name || !description || !specs || !hourlyRate) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  }

  const station = await prisma.station.create({
    data: {
      name, description, specs,
      hourlyRate:     parseFloat(hourlyRate),
      minDuration:    minDuration    != null ? parseFloat(minDuration) : 1,
      hasControllers: hasControllers != null ? Boolean(hasControllers) : true,
      position:       position ?? 0,
    },
  });

  return NextResponse.json({ station }, { status: 201 });
}
