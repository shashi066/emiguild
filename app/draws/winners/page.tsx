import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  const last4 = digits.slice(-4)
  return `****${last4}`
}

export default async function DrawWinnersPage() {
  const draws = await prisma.luckyDraw.findMany({
    where: { status: 'CLOSED', winnerId: { not: null } },
    include: {
      winner: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { winnerPickedAt: 'desc' },
  })

  return (
    <div className="page-wrapper">
      <div className="container" style={{ paddingTop: 'var(--space-3xl)' }}>
        <div className="page-header">
          <h1 className="page-title font-orbitron">
            🏅 <span className="text-gradient">Past Winners</span>
          </h1>
          <p className="page-subtitle">Guild Drop champions who took home the prize</p>
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <Link href="/draws" className="btn btn-ghost btn-sm">
            ← Back to Guild Drop
          </Link>
        </div>

        {draws.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-md)' }}>🎲</div>
            <h3>No winners yet</h3>
            <p>Winners will appear here after each draw closes.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
            {draws.map((draw) => (
              <Link
                key={draw.id}
                href={`/draws/${draw.id}/winner`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  className="card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-md)',
                    flexWrap: 'wrap',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                      {draw.title}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-accent-secondary)' }}>
                      🏆 {draw.prize}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {draw.winner?.name ?? '—'}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                      {maskPhone(draw.winner?.phone)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {draw.winnerPickedAt
                        ? new Date(draw.winnerPickedAt).toLocaleDateString('en-IN')
                        : '—'}
                    </div>
                    <span className="badge" style={{ marginTop: 4 }}>View →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
