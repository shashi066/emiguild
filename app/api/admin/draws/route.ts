import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const draws = await prisma.luckyDraw.findMany({
    where: { status: { not: 'ARCHIVED' } },
    include: {
      _count: { select: { entries: true } },
      winner: { select: { id: true, name: true, phone: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ draws })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { title, description, prize, status, startsAt, endsAt } = await req.json()
  if (!title || !prize) {
    return NextResponse.json({ error: 'title and prize are required' }, { status: 400 })
  }

  const draw = await prisma.luckyDraw.create({
    data: {
      title,
      description: description || null,
      prize,
      status: status || 'DRAFT',
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
    },
  })

  return NextResponse.json({ draw }, { status: 201 })
}
