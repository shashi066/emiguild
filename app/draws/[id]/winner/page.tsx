import React from 'react';
import { prisma } from '@/lib/prisma';
import WinnerCard from '@/components/WinnerCard';

function maskPhone(phone?: string | null) {
  if (!phone) return null;
  const s = phone.replace(/\D/g, '');
  return s.length <= 4 ? `****${s}` : `****${s.slice(-4)}`;
}

export default async function PublicWinnerPage({ params }: { params: { id: string } }) {
  const id = (await params)?.id;
  if (!id) return (<div style={{ padding: 24 }}>Invalid draw id</div>);

  const draw = await prisma.draw.findUnique({ where: { id } });
  if (!draw) return (<div style={{ padding: 24 }}>Draw not found</div>);

  // Prefer winnerUserId stored on draw (set by pick-winner endpoint). Fallback to first entry.
  const winnerUserId = draw.winnerUserId;
  let winnerEntry = null;
  let user = null;

  if (winnerUserId) {
    user = await prisma.user.findUnique({ where: { id: winnerUserId }, select: { id: true, name: true, phone: true, email: true } });
    // attempt to find a drawEntry for richer info
    winnerEntry = await prisma.drawEntry.findFirst({ where: { drawId: id, userId: winnerUserId, isDeleted: false }, orderBy: { createdAt: 'asc' } });
  } else {
    winnerEntry = await prisma.drawEntry.findFirst({ where: { drawId: id, isDeleted: false }, orderBy: { createdAt: 'asc' } });
    if (winnerEntry) user = await prisma.user.findUnique({ where: { id: winnerEntry.userId }, select: { id: true, name: true, phone: true, email: true } });
  }

  if (!winnerEntry && !user) {
    return (
      <div style={{ padding: 24 }}>
        <h1>No winner selected yet</h1>
        <p>The draw does not have a selected winner. Come back later.</p>
      </div>
    );
  }

  // find latest pass for the user if any
  const pass = user ? await prisma.userPass.findFirst({ where: { userId: user.id }, orderBy: { purchasedAt: 'desc' } }) : null;

  if (!pass) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Winner found but no pass assigned</h1>
        <p>Pick a winner and assign a pass from the admin panel first.</p>
      </div>
    );
  }

  const winnerForCard = {
    id: winnerEntry?.id || `entry-${user?.id}`,
    drawId: id,
    userId: user?.name || user?.email || user?.id,
    phone: maskPhone(winnerEntry?.phone || user?.phone || null),
    createdAt: (winnerEntry?.createdAt || new Date()).toISOString(),
  };

  const passForCard = {
    id: pass.id,
    userId: pass.userId,
    passType: pass.passType,
    totalHours: pass.totalHours,
    price: pass.price,
    purchasedAt: pass.purchasedAt.toISOString(),
    expiresAt: pass.expiresAt.toISOString(),
  };

  return (
    <div style={{ padding: 24 }}>
      {/* @ts-expect-error Server -> client prop */}
      <WinnerCard winner={winnerForCard} pass={passForCard} drawTitle={draw.title} prizeName={draw.prizeName} />
    </div>
  );
}
