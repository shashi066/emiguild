"use client";

import React from 'react';

export default function DeleteDrawButton({ drawId }: { drawId: string }) {
  const handleDelete = async () => {
    if (!confirm('Delete this draw? This will soft-delete the draw and cannot be undone.')) return;
    try {
      const res = await fetch(`/api/admin/draws/${drawId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        // reload page to reflect deletion
        window.location.reload();
      } else {
        alert(data.error || 'Failed to delete draw');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete draw');
    }
  };

  return (
    <button onClick={handleDelete} className="btn btn-danger btn-sm">Delete</button>
  );
}
