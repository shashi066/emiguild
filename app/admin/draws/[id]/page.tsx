import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminDrawDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  const { id } = await params
  const draw = await prisma.luckyDraw.findUnique({
    where: { id },
    include: {
      entries: {
        include: { user: { select: { id: true, name: true, phone: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
      winner: { select: { id: true, name: true, phone: true } },
    },
  })

  if (!draw) notFound()

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-xl)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <Link href="/admin/draws" className="btn btn-ghost btn-sm">
          ← Back
        </Link>
        <div>
          <h1 className="font-orbitron" style={{ fontSize: '1.3rem', marginBottom: 4 }}>
            {draw.title}
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            {draw.entries.length} {draw.entries.length === 1 ? 'entry' : 'entries'} · Prize: {draw.prize}
          </p>
        </div>
      </div>

      {draw.winner && (
        <div
          className="card"
          style={{
            marginBottom: 'var(--space-lg)',
            background: 'rgba(0,230,118,0.07)',
            borderColor: 'var(--color-accent-success)',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--color-accent-success)', marginBottom: 4 }}>
            🏆 Winner
          </div>
          <div>{draw.winner.name}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{draw.winner.phone ?? '—'}</div>
          <Link
            href={`/draws/${draw.id}/winner?admin=1`}
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 'var(--space-sm)' }}
          >
            View Winner Card
          </Link>
        </div>
      )}

      {draw.entries.length === 0 ? (
        <div className="empty-state">
          <p>No entries yet.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Entered At</th>
              </tr>
            </thead>
            <tbody>
              {draw.entries.map((entry, i) => (
                <tr key={entry.id} style={draw.winnerId === entry.userId ? { background: 'rgba(0,230,118,0.06)' } : {}}>
                  <td style={{ color: 'var(--color-text-muted)' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>
                    {entry.user.name}
                    {draw.winnerId === entry.userId && (
                      <span style={{ marginLeft: 6, color: 'var(--color-accent-success)', fontSize: '0.8rem' }}>🏆</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{entry.user.email}</td>
                  <td style={{ fontSize: '0.85rem' }}>{entry.user.phone ?? '—'}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    {new Date(entry.createdAt).toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
