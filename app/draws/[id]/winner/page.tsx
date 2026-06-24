import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import WinnerCardActions from './WinnerCardActions'

export const dynamic = 'force-dynamic'

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  const last4 = digits.slice(-4)
  return `****${last4}`
}

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ admin?: string }>
}

export default async function WinnerPage({ params, searchParams }: Props) {
  const session = await auth()
  const isAdmin = session?.user?.role === 'ADMIN'
  const { id } = await params
  const { admin } = await searchParams
  const showFull = isAdmin && admin === '1'

  const draw = await prisma.luckyDraw.findUnique({
    where: { id },
    include: {
      winner: { select: { id: true, name: true, phone: true, email: true } },
    },
  })

  if (!draw || draw.status !== 'CLOSED' || !draw.winner) notFound()

  const winnerPhone = showFull
    ? (draw.winner.phone ?? '—')
    : maskPhone(draw.winner.phone)

  const winnerEmail = showFull ? draw.winner.email : null

  return (
    <div className="page-wrapper">
      <div className="container" style={{ paddingTop: 'var(--space-3xl)', paddingBottom: 'var(--space-3xl)' }}>
        <div style={{ marginBottom: 'var(--space-xl)', textAlign: 'center' }}>
          <Link href="/draws/winners" className="btn btn-ghost btn-sm no-print">
            ← All Winners
          </Link>
        </div>

        <div className="winner-card">
          <div style={{ fontSize: '3.5rem', marginBottom: 'var(--space-md)' }}>🏆</div>
          <div
            style={{
              fontSize: '0.7rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginBottom: 'var(--space-xs)',
            }}
          >
            Winner — {draw.winnerPickedAt ? new Date(draw.winnerPickedAt).toLocaleDateString('en-IN', { dateStyle: 'long' }) : ''}
          </div>
          <h2
            className="font-orbitron"
            style={{ fontSize: '1.4rem', marginBottom: 'var(--space-xs)', color: 'var(--color-text-primary)' }}
          >
            {draw.title}
          </h2>

          <div
            style={{
              background: 'rgba(108,99,255,0.1)',
              border: '1px solid rgba(108,99,255,0.25)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-lg)',
              margin: 'var(--space-lg) 0',
            }}
          >
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 4 }}>
              {draw.winner.name}
            </div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: 2 }}>
              📞 {winnerPhone}
            </div>
            {winnerEmail && (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                ✉️ {winnerEmail}
              </div>
            )}
          </div>

          <div
            style={{
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-md)',
              marginBottom: 'var(--space-lg)',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              Prize
            </div>
            <div style={{ fontWeight: 700, color: 'var(--color-accent-secondary)', fontSize: '1.05rem' }}>
              {draw.prize}
            </div>
          </div>

          <WinnerCardActions
            winnerName={draw.winner.name}
            drawTitle={draw.title}
            prize={draw.prize}
            phone={winnerPhone}
          />
        </div>
      </div>
    </div>
  )
}
