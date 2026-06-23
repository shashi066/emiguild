import React from 'react';
import AdminDrawForm from '@/components/AdminDrawForm';
import { auth } from '@/auth';

export default async function NewDrawPage() {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return (
      <div style={{ padding: 24 }}>
        <h1>Forbidden</h1>
        <p>You must be an admin to create draws.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Create Draw</h1>
      </div>

      <div style={{ marginTop: 16 }}>
        {/* AdminDrawForm is a client component that handles POST to /api/admin/draws */}
        {/* @ts-ignore Server -> Client */}
        <AdminDrawForm />
      </div>
    </div>
  );
}
