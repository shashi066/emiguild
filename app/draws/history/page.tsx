import React from 'react';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

function maskPhone(phone?: string | null) {
  if (!phone) return '';
  const s = phone.replace(/\D/g, '');
  return s.length <= 4 ? `****${s}` : `****${s.slice(-4)}`;
}

export default async function PastWinnersPage() {
  // Fetch completed draws
  const draws = await prisma.draw.findMany({
    where: { status: 'COMPLETED', isDeleted: false },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, prizeName: true, updatedAt: true, winnerUserId: true },
  });

  // Fetch winner users in parallel
  const users = await Promise.all(draws.map((d) => d.winnerUserId ? prisma.user.findUnique({ where: { id: d.winnerUserId }, select: { id: true, name: true, phone: true, email: true } }) : Promise.resolve(null)));

  return (
    <div style={{ padding: 24 }}>
      <h1>Past Winners</h1>
      {draws.length === 0 && (
        <div style={{ marginTop: 12 }}>No completed draws yet.</div>
      )}

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {draws.map((d, i) => {
          const user = users[i];
          return (
            <div key={d.id} style={{ border: '1px solid #eee', padding: 16, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{d.title}</div>
                <div style={{ color: '#666', fontSize: 13 }}>{d.prizeName}</div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 6 }}>Draw completed: {new Date(d.updatedAt).toLocaleString()}</div>
              </div>

              <div style={{ textAlign: 'right' }}>
                {user ? (
                  <>
                    <div style={{ fontWeight: 700 }}>{user.name || user.email}</div>
                    <div style={{ color: '#666', fontSize: 13 }}>Contact: {maskPhone(user.phone)}</div>
                  </>
                ) : (
                  <div style={{ color: '#666' }}>Winner details not available</div>
                )}
                <div style={{ marginTop: 8 }}>
                  <Link href={`/draws/${d.id}/winner`} className="btn btn-ghost btn-sm">View Card</Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
