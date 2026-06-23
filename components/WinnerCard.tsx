"use client";

import React from 'react';

type Winner = {
  id: string;
  drawId: string;
  userId: string;
  phone?: string | null;
  createdAt: string;
};

type Pass = {
  id: string;
  userId: string;
  passType: string;
  totalHours: number;
  price: number;
  purchasedAt: string;
  expiresAt: string;
};
export default function WinnerCard({ winner, pass, drawTitle, prizeName, winnerName }: { winner: Winner; pass?: Pass; drawTitle?: string; prizeName?: string; winnerName?: string }) {
  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const text = `Winner of ${drawTitle || 'the draw'}: ${winnerName || winner.userId} (last 4: ****${(winner.phone || '').slice(-4)})\nPrize: ${prizeName || ''}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Winner • ${drawTitle || 'Draw'}`, text });
      } catch (err) {
        console.error('Share failed', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        alert('Winner details copied to clipboard — paste anywhere to share.');
      } catch (err) {
        alert('Sharing not supported — please copy manually.');
      }
    }
  };



  return (
    <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
      <div id="winner-card" style={{ width: 720, borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ background: 'linear-gradient(90deg,#6c63ff,#00d4ff)', color: '#fff', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <img src="/images/logoImage.png" alt="EmiGuild" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }} />
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Winner Announcement</h2>
                <div style={{ opacity: 0.95, marginTop: 6, fontWeight: 600 }}>{drawTitle || 'Community Draw'}</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', padding: 28 }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ width: 120, height: 120, borderRadius: 12, background: 'linear-gradient(180deg,#f4f6ff,#fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 700, color: '#2b2b2b' }}>
              🎮
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: '#666' }}>Winner</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{winnerName || winner.userId}</div>
              <div style={{ marginTop: 8, color: '#444' }}>Contact: ****{(winner.phone || '').slice(-4)}</div>
            </div>

            <div style={{ width: 220, borderLeft: '1px dashed #eee', paddingLeft: 20 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Prize</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{prizeName || '—'}</div>
              <div style={{ marginTop: 6, color: '#444' }}>{/* optional extra info could go here */}</div>
            </div>
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button onClick={handlePrint} className="btn btn-primary">Print / Save</button>
            <button onClick={handleShare} className="btn btn-ghost">Share</button>
            <button onClick={() => { navigator.clipboard?.writeText(JSON.stringify({ winner, prizeName }, null, 2)); alert('JSON copied to clipboard'); }} className="btn btn-outline">Copy JSON</button>
          </div>

          <div style={{ marginTop: 18, fontSize: 12, color: '#888' }}>
            Tip: Use your device camera or `Save as PDF` (Print) to create a shareable image for social posts.
          </div>
        </div>
      </div>
    </div>
  );
}
