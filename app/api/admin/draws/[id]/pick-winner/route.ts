import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const draw = await prisma.luckyDraw.findUnique({
    where: { id },
    include: { _count: { select: { entries: true } } },
  })

  if (!draw) return NextResponse.json({ error: 'Draw not found' }, { status: 404 })
  if (draw.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Draw must be ACTIVE to pick winner' }, { status: 400 })
  }
  if (draw._count.entries === 0) {
    return NextResponse.json({ error: 'No entries in this draw' }, { status: 400 })
  }

  const entries = await prisma.drawEntry.findMany({
    where: { drawId: id },
    include: { user: { select: { id: true, name: true, phone: true, email: true } } },
  })

  const winner = entries[Math.floor(Math.random() * entries.length)]

  const updated = await prisma.luckyDraw.update({
    where: { id },
    data: {
      winnerId: winner.userId,
      winnerPickedAt: new Date(),
      status: 'CLOSED',
    },
  })

  return NextResponse.json({
    draw: updated,
    winner: {
      id: winner.user.id,
      name: winner.user.name,
      phone: winner.user.phone,
      email: winner.user.email,
    },
  })
}
