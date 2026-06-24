import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const draw = await prisma.luckyDraw.findUnique({
    where: { id },
    include: {
      _count: { select: { entries: true } },
      winner: { select: { id: true, name: true, phone: true } },
    },
  })

  if (!draw) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const session = await auth()
  const isAdmin = session?.user?.role === 'ADMIN'

  return NextResponse.json({
    draw: {
      ...draw,
      winner: draw.winner
        ? {
            id: draw.winner.id,
            name: draw.winner.name,
            phone: isAdmin ? draw.winner.phone : maskPhone(draw.winner.phone),
          }
        : null,
    },
  })
}

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const last4 = digits.slice(-4)
  return `****${last4}`
}
