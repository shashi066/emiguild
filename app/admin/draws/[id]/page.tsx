import React from 'react';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export default async function DrawDetailPage({ params }: { params: any }) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return (
      <div style={{ padding: 24 }}>
        <h1>Forbidden</h1>
        <p>You must be an admin to view this page.</p>
      </div>
    );
  }
  // `params` can be a Promise in some Next.js runtime contexts — await it to be safe
  const resolvedParams = await params;
  const id = resolvedParams?.id;

  if (!id) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Invalid draw</h1>
        <p>No draw id provided.</p>
      </div>
    );
  }

  const draw = await prisma.draw.findUnique({
    where: { id },
    include: { entries: { where: { isDeleted: false }, include: { user: { select: { id: true, name: true, email: true, phone: true } } } } },
  });

  return (
    <div style={{ padding: 24 }}>
      {!draw && <div>Draw not found</div>}
      {draw && (
        <div>
          <h1>{draw.title}</h1>
          <p>{draw.description}</p>
          <p>Prize: {draw.prizeName}</p>

          <p>Status: {draw.status}</p>

          <div style={{ marginTop: 16 }}>
            <h3>Participants</h3>
            {draw.entries?.length === 0 && <div>No participants yet</div>}
            <ul>
              {draw.entries?.map((e: any) => (
                <li key={e.id}>{e.user?.name} • ****{(e.phone || e.user?.phone || '').slice(-4)}</li>
              ))}
            </ul>
          </div>

          <div style={{ marginTop: 16 }}>
            <form action={`/api/admin/draws/${id}/pick-winner`} method="post">
              <button type="submit" className="btn btn-primary">Pick Random Winner</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
