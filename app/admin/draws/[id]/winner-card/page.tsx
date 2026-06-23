import React from 'react';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import WinnerCard from '@/components/WinnerCard';

export default async function WinnerCardPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return (
      <div style={{ padding: 24 }}>
        <h1>Forbidden</h1>
        <p>You must be an admin to view this page.</p>
      </div>
    );
  }

  const id = (await params)?.id;
  if (!id) return (<div style={{ padding: 24 }}>Invalid draw id</div>);

  const draw = await prisma.draw.findUnique({ where: { id }, include: { entries: true } });
  if (!draw) return (<div style={{ padding: 24 }}>Draw not found</div>);

  // find winner entry if present
  const winnerEntry = await prisma.drawEntry.findFirst({ where: { drawId: id, isDeleted: false }, orderBy: { createdAt: 'asc' } });
  // fetch user details for winner
  const winnerUser = winnerEntry ? await prisma.user.findUnique({ where: { id: winnerEntry.userId }, select: { id: true, name: true, phone: true, email: true } }) : null;
  // find pass for winner user if exists
  // find an actual user pass for the winner
  const actualPass = winnerEntry ? await prisma.userPass.findFirst({ where: { userId: winnerEntry.userId }, orderBy: { purchasedAt: 'desc' } }) : null;

  if (!winnerEntry || !actualPass) {
    return (
      <div style={{ padding: 24 }}>
        <h1>No winner or pass found yet</h1>
        <p>Please pick a winner and assign a pass first using the admin draw detail page.</p>
      </div>
    );
  }

  const passForCard = {
    id: actualPass.id,
    userId: actualPass.userId,
    passType: actualPass.passType,
    totalHours: actualPass.totalHours,
    price: actualPass.price,
    purchasedAt: actualPass.purchasedAt.toISOString(),
    expiresAt: actualPass.expiresAt.toISOString(),
  };

  return (
    <div>
      {/* Render a client-side WinnerCard for better interactivity (print/share) */}
      {/* @ts-expect-error Async server component passing props to client component */}
      <WinnerCard
        winner={{ id: winnerEntry.id, drawId: winnerEntry.drawId, userId: winnerEntry.userId, phone: winnerEntry.phone || null, createdAt: winnerEntry.createdAt.toISOString() }}
        pass={passForCard}
        drawTitle={draw.title}
        prizeName={draw.prizeName}
        winnerName={winnerUser?.name || winnerUser?.email || undefined}
      />
    </div>
  );
}
