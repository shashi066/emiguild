import React from 'react';
import Link from 'next/link';
import DrawEntryForm from '@/components/DrawEntryForm';
import { prisma } from '@/lib/prisma';

async function getActiveDraw() {
  return prisma.draw.findFirst({
    where: { status: 'ACTIVE', isDeleted: false },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, description: true, prizeName: true, startAt: true, endAt: true },
  });
}

export default async function DrawsPage() {
  const draw = await getActiveDraw();

  return (
    <div style={{ padding: 32, maxWidth: 980, margin: '0 auto', color: '#E6EEF8', background: 'transparent' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              background: 'linear-gradient(135deg, #2b2f45, #141824)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
            }}>🎁</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.05, fontWeight: 800 }}>🎁 Guild Drop</h1>
              <div style={{ marginTop: 6, color: '#9AA4B2', fontSize: 14 }}>Prize draws and winners — check details and enter while open.</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/draws/history" className="btn btn-ghost btn-sm">View Past Winners</Link>
        </div>
      </header>

      {!draw ? (
        <div style={{
          borderRadius: 12,
          padding: 28,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))',
          border: '1px solid rgba(255,255,255,0.04)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 42 }}>🎯</div>
          <h3 style={{ marginTop: 8, marginBottom: 6, color: '#E6EEF8' }}>No active draws at the moment.</h3>
          <p style={{ margin: 0, color: '#9AA4B2' }}>Check past winners or come back later for the next Guild Drop.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
          <div style={{ padding: 20, borderRadius: 12, background: '#071129', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
            <h2 style={{ marginTop: 0, fontSize: 20, marginBottom: 8, color: '#E6EEF8' }}>{draw.title || '🎁 Guild Drop'}</h2>
            <p style={{ marginTop: 0, color: '#9AA4B2', lineHeight: 1.6 }}>{draw.description}</p>

            <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', fontWeight: 600, fontSize: 13, color: '#E6EEF8' }}>
                Starts: {draw.startAt ? new Date(draw.startAt).toLocaleString() : '—'}
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', fontWeight: 600, fontSize: 13, color: '#E6EEF8' }}>
                Ends: {draw.endAt ? new Date(draw.endAt).toLocaleString() : '—'}
              </div>
            </div>
          </div>

          <aside style={{ padding: 20, borderRadius: 12, background: 'linear-gradient(180deg,#0b1220,#071129)', boxShadow: '0 10px 30px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#9AA4B2' }}>Featured Prize</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, color: '#E6EEF8' }}>{draw.prizeName}</div>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ marginBottom: 8, fontSize: 13, color: '#9AA4B2' }}>Enter the draw</div>
              <div style={{ background: 'transparent' }}>
                <DrawEntryForm drawId={draw.id} />
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
