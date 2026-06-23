import React from 'react';
import AdminDrawForm from '@/components/AdminDrawForm';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export default async function EditDrawPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return (
      <div style={{ padding: 24 }}>
        <h1>Forbidden</h1>
        <p>You must be an admin to edit draws.</p>
      </div>
    );
  }

  const draw = await prisma.draw.findUnique({ where: { id: params.id } });
  if (!draw) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Not found</h1>
      </div>
    );
  }

  const initial = {
    id: draw.id,
    title: draw.title,
    description: draw.description || '',
    prizeName: draw.prizeName || '',
    startAt: draw.startAt ? draw.startAt.toISOString() : null,
    endAt: draw.endAt ? draw.endAt.toISOString() : null,
    status: draw.status,
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Edit Draw</h1>
      {/* @ts-ignore Server -> Client */}
      <AdminDrawForm initial={initial} />
    </div>
  );
}
