import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import DeleteDrawButton from '@/components/DeleteDrawButton';

export default async function AdminDrawsPage() {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return (
      <div style={{ padding: 24 }}>
        <h1>Forbidden</h1>
        <p>You must be an admin to view this page.</p>
      </div>
    );
  }

  const draws = await prisma.draw.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: 'desc' },
    include: { entries: { where: { isDeleted: false } } },
  });

  // fetch winner user info for each draw (if present)
  const winners = await Promise.all(draws.map((d) => d.winnerUserId ? prisma.user.findUnique({ where: { id: d.winnerUserId }, select: { id: true, name: true, phone: true, email: true } }) : Promise.resolve(null)));

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Draws</h1>
        <Link href="/admin/draws/new" className="btn">Create Draw</Link>
      </div>

      <div style={{ marginTop: 16 }}>
        {draws.length === 0 && <div>No draws yet.</div>}
        {draws.map((d: any, i: number) => (
          <div key={d.id ?? Math.random()} style={{ border: '1px solid #eee', padding: 12, marginBottom: 8, borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{d.title}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{d.prizeName} • {d.status}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{(d.entries || []).length} participants</div>
                <div style={{ fontSize: 11, color: '#999' }}>id: {d.id ?? '(missing)'}</div>
                {winners[i] && (
                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    <strong>Winner:</strong> {winners[i].name || winners[i].email} <span style={{ color: '#444' }}>• {winners[i].phone}</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {d.id ? (
                  <>
                    <Link href={`/admin/draws/${d.id}`} className="btn btn-sm">Manage</Link>
                    <DeleteDrawButton drawId={d.id} />
                  </>
                ) : (
                  <button className="btn btn-sm" disabled>Manage</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
