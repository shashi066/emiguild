import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

export async function GET() {
  const draws = await prisma.luckyDraw.findMany({
    where: { status: { in: ['ACTIVE', 'CLOSED'] } },
    include: {
      _count: { select: { entries: true } },
      winner: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const masked = draws.map((d) => ({
    ...d,
    winner: d.winner
      ? {
          id: d.winner.id,
          name: d.winner.name,
          phone: maskPhone(d.winner.phone),
        }
      : null,
  }))

  return NextResponse.json({ draws: masked })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { drawId } = await req.json()
  if (!drawId) return NextResponse.json({ error: 'drawId required' }, { status: 400 })

  const draw = await prisma.luckyDraw.findUnique({ where: { id: drawId } })
  if (!draw || draw.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Draw not active' }, { status: 400 })
  }

  try {
    const entry = await prisma.drawEntry.create({
      data: { drawId, userId: session.user.id },
    })
    return NextResponse.json({ entry, message: "You're in! 🎉" }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Already entered' }, { status: 409 })
  }
}

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const last4 = digits.slice(-4)
  return `+${digits.slice(0, digits.length - 10)} ****${last4}`.replace(/^\+ /, '+')
    .trim() || `****${last4}`
}
