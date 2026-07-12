import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const { id } = await params;

  try {
    const body = await req.json();
    const station = await prisma.station.update({
      where: { id },
      data: {
        ...(body.name        != null && body.name        !== '' && { name: body.name }),
        ...(body.description != null && body.description !== '' && { description: body.description }),
        ...(body.specs       != null && body.specs       !== '' && { specs: body.specs }),
        ...(body.hourlyRate  != null && { hourlyRate:  parseFloat(String(body.hourlyRate)) }),
        ...(body.minDuration != null && { minDuration: parseFloat(String(body.minDuration)) }),
        ...(body.position    != null && { position:    parseInt(String(body.position), 10) }),
        ...(body.hasControllers != null && { hasControllers: Boolean(body.hasControllers) }),
        ...(body.isActive    != null && { isActive: body.isActive }),
        ...('linkedStationId' in body && { linkedStationId: body.linkedStationId || null }),
      },
    });
    return NextResponse.json({ station });
  } catch (err) {
    console.error('[PATCH /api/stations/:id]', err);
    return NextResponse.json({ error: 'Failed to update station', detail: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const { id } = await params;

  await prisma.station.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
