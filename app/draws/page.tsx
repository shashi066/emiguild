import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import Link from 'next/link'
import EnterDrawButton from './EnterDrawButton'

export const dynamic = 'force-dynamic'

export default async function DrawsPage() {
  const session = await auth()

  const activeDraw = await prisma.luckyDraw.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [
        { endsAt: null },
        { endsAt: { gt: new Date() } },
      ],
    },
    include: { _count: { select: { entries: true } } },
    orderBy: { createdAt: 'desc' },
  })

  let userAlreadyEntered = false
  if (session && activeDraw) {
    const entry = await prisma.drawEntry.findUnique({
      where: { drawId_userId: { drawId: activeDraw.id, userId: session.user.id } },
    })
    userAlreadyEntered = !!entry
  }

  return (
    <div className="page-wrapper">
      <div className="container" style={{ maxWidth: 760, paddingTop: 'var(--space-3xl)' }}>
        <div className="page-header">
          <h1 className="page-title font-orbitron">
            🎁 <span className="text-gradient">Guild Drop</span>
          </h1>
          <p className="page-subtitle">
            Enter the lucky draw and win amazing prizes at the gaming cafe!
          </p>
        </div>

        {activeDraw ? (
          <div className="draw-card-featured" style={{ marginBottom: 'var(--space-xl)' }}>
            <div
              style={{
                position: 'absolute',
                top: -40,
                right: -40,
                width: 160,
                height: 160,
                background: 'radial-gradient(circle, rgba(108,99,255,0.25) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ marginBottom: 'var(--space-sm)' }}>
              <span className="badge" style={{ background: 'rgba(0,230,118,0.15)', color: 'var(--color-accent-success)', border: '1px solid var(--color-accent-success)' }}>
                ● LIVE
              </span>
            </div>
            <h2
              className="font-orbitron"
              style={{ fontSize: '1.6rem', marginBottom: 'var(--space-sm)', color: 'var(--color-text-primary)' }}
            >
              {activeDraw.title}
            </h2>
            {activeDraw.description && (
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
                {activeDraw.description}
              </p>
            )}
            <div
              style={{
                background: 'rgba(108,99,255,0.1)',
                border: '1px solid rgba(108,99,255,0.3)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-md)',
                marginBottom: 'var(--space-lg)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Prize
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-accent-secondary)' }}>
                🏆 {activeDraw.prize}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
              {session ? (
                <EnterDrawButton
                  drawId={activeDraw.id}
                  alreadyEntered={userAlreadyEntered}
                />
              ) : (
                <Link href="/login" className="btn btn-primary">
                  Login to Enter Draw
                </Link>
              )}
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                {activeDraw._count.entries} {activeDraw._count.entries === 1 ? 'entry' : 'entries'} so far
              </span>
            </div>

            {activeDraw.endsAt && (
              <p style={{ marginTop: 'var(--space-md)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Draw closes:{' '}
                {new Date(activeDraw.endsAt).toLocaleString('en-IN', {
                  dateStyle: 'long',
                  timeStyle: 'short',
                })}
              </p>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>🎲</div>
            <h3>No active draw right now</h3>
            <p>Check back soon — something exciting is coming!</p>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 'var(--space-xl)' }}>
          <Link href="/draws/winners" className="btn btn-ghost">
            🏅 View Past Winners
          </Link>
        </div>
      </div>
    </div>
  )
}
