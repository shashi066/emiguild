import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import Link from 'next/link'
import EnterDrawButton from './EnterDrawButton'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DrawsPage() {
  const session = await auth()

  const activeDraws = await prisma.luckyDraw.findMany({
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

  // Build a set of draw IDs the current user has already entered
  const enteredDrawIds = new Set<string>()
  if (session && activeDraws.length > 0) {
    const entries = await prisma.drawEntry.findMany({
      where: {
        userId: session.user.id,
        drawId: { in: activeDraws.map((d) => d.id) },
      },
      select: { drawId: true },
    })
    entries.forEach((e) => enteredDrawIds.add(e.drawId))
  }

  return (
    <div className="page-wrapper">
      <div className="container" style={{ maxWidth: 760, paddingTop: 'var(--space-3xl)' }}>
        <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}>
          <ArrowLeft size={16} />
          Back to Home
        </Link>

        <div className="page-header">
          <h1 className="page-title font-orbitron">
            🎁 <span className="text-gradient">Guild Drop</span>
          </h1>
          <p className="page-subtitle">
            Enter the lucky draw and win amazing prizes at the gaming cafe!
          </p>
        </div>

        {activeDraws.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
            {activeDraws.map((draw) => (
              <div key={draw.id} className="draw-card-featured" style={{ marginBottom: 0 }}>
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
                  {draw.title}
                </h2>
                {draw.description && (
                  <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
                    {draw.description}
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
                    🏆 {draw.prize}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
                  {session ? (
                    <EnterDrawButton
                      drawId={draw.id}
                      alreadyEntered={enteredDrawIds.has(draw.id)}
                    />
                  ) : (
                    <Link href="/login" className="btn btn-primary">
                      Login to Enter Draw
                    </Link>
                  )}
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    {draw._count.entries} {draw._count.entries === 1 ? 'entry' : 'entries'} so far
                  </span>
                </div>

                {draw.endsAt && (
                  <p style={{ marginTop: 'var(--space-md)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Draw closes:{' '}
                    {new Date(draw.endsAt).toLocaleString('en-IN', {
                      dateStyle: 'long',
                      timeStyle: 'short',
                      timeZone: 'Asia/Kolkata',
                    })}
                  </p>
                )}
              </div>
            ))}
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
