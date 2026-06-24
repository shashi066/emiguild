'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type DrawStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED'

interface Draw {
  id: string
  title: string
  description: string | null
  prize: string
  status: DrawStatus
  startsAt: string | null
  endsAt: string | null
  winnerId: string | null
  winnerPickedAt: string | null
  createdAt: string
  _count: { entries: number }
  winner: { id: string; name: string; phone: string | null; email: string } | null
}

const STATUS_COLORS: Record<DrawStatus, string> = {
  DRAFT: 'rgba(139,156,184,0.2)',
  ACTIVE: 'rgba(0,230,118,0.15)',
  CLOSED: 'rgba(108,99,255,0.15)',
  ARCHIVED: 'rgba(255,59,48,0.1)',
}
const STATUS_TEXT: Record<DrawStatus, string> = {
  DRAFT: '#8b9cb8',
  ACTIVE: 'var(--color-accent-success)',
  CLOSED: 'var(--color-accent-primary)',
  ARCHIVED: 'var(--color-accent-error)',
}

const EMPTY_FORM = {
  title: '',
  description: '',
  prize: '',
  status: 'DRAFT' as DrawStatus,
  startsAt: '',
  endsAt: '',
}

export default function AdminDrawsPage() {
  const router = useRouter()
  const [draws, setDraws] = useState<Draw[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [pickingId, setPickingId] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{
    title: string
    message: string
    onConfirm: () => void
    danger?: boolean
  } | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/draws')
      if (res.ok) {
        const data = await res.json()
        setDraws(data.draws ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  const openEdit = (d: Draw) => {
    setEditingId(d.id)

    // Convert ISO string to local datetime-local format (YYYY-MM-DDTHH:mm)
    const toLocalInput = (iso: string | null) => {
      if (!iso) return ''
      const date = new Date(iso)
      const y = date.getFullYear()
      const mo = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const h = String(date.getHours()).padStart(2, '0')
      const min = String(date.getMinutes()).padStart(2, '0')
      return `${y}-${mo}-${day}T${h}:${min}`
    }

    setForm({
      title: d.title,
      description: d.description ?? '',
      prize: d.prize,
      status: d.status,
      startsAt: toLocalInput(d.startsAt),
      endsAt: toLocalInput(d.endsAt),
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.prize.trim()) {
      setError('Title and prize are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const url = editingId ? `/api/admin/draws/${editingId}` : '/api/admin/draws'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          startsAt: form.startsAt || null,
          endsAt: form.endsAt || null,
        }),
      })
      if (res.ok) {
        setShowModal(false)
        setSuccess(editingId ? 'Draw updated!' : 'Draw created!')
        setTimeout(() => setSuccess(''), 3000)
        await load()
      } else {
        const data = await res.json()
        setError(data.error ?? 'Something went wrong')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async (id: string) => {
    setConfirmModal({
      title: 'Archive Draw',
      message: 'Are you sure you want to archive this draw? It will no longer be visible to users.',
      danger: true,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/draws/${id}`, { method: 'DELETE' })
        if (res.ok) {
          setSuccess('Draw archived')
          setTimeout(() => setSuccess(''), 3000)
          await load()
        }
        setConfirmModal(null)
      },
    })
  }

  const handlePickWinner = async (id: string) => {
    setConfirmModal({
      title: '🎲 Pick Winner',
      message: 'Randomly pick a winner from all entries? This will close the draw.',
      danger: false,
      onConfirm: async () => {
        setConfirmModal(null)
        setPickingId(id)
        try {
          const res = await fetch(`/api/admin/draws/${id}/pick-winner`, { method: 'POST' })
          if (res.ok) {
            router.push(`/draws/${id}/winner?admin=1`)
          } else {
            const data = await res.json()
            setError(data.error ?? 'Failed to pick winner')
            setTimeout(() => setError(''), 4000)
          }
        } finally {
          setPickingId(null)
        }
      },
    })
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-xl)',
          flexWrap: 'wrap',
          gap: 'var(--space-md)',
        }}
      >
        <div>
          <h1 className="font-orbitron" style={{ fontSize: '1.4rem', marginBottom: 4 }}>
            🎁 Lucky Draw
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
            Manage draws, entries and pick winners
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New Draw
        </button>
      </div>

      {error && <div className="alert" style={{ marginBottom: 'var(--space-md)', background: 'rgba(255,59,48,0.1)', borderColor: 'var(--color-accent-error)', color: 'var(--color-accent-error)' }}>{error}</div>}
      {success && <div className="alert" style={{ marginBottom: 'var(--space-md)', background: 'rgba(0,230,118,0.08)', borderColor: 'var(--color-accent-success)', color: 'var(--color-accent-success)' }}>{success}</div>}

      {loading ? (
        <div className="loading-state">Loading draws…</div>
      ) : draws.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-md)' }}>🎲</div>
          <h3>No draws yet</h3>
          <p>Create your first lucky draw to get started.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Entries</th>
                <th>Winner</th>
                <th>Prize</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {draws.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{d.title}</div>
                    {d.description && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {d.description.slice(0, 60)}{d.description.length > 60 ? '…' : ''}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: STATUS_COLORS[d.status],
                        color: STATUS_TEXT[d.status],
                        border: `1px solid ${STATUS_TEXT[d.status]}`,
                      }}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{d._count.entries}</td>
                  <td>
                    {d.winner ? (
                      <div>
                        <div style={{ fontWeight: 600 }}>{d.winner.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                          {d.winner.phone ?? '—'}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ maxWidth: 160, fontSize: '0.88rem' }}>{d.prize}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => openEdit(d)}
                      >
                        Edit
                      </button>
                      {d.status === 'ACTIVE' && d._count.entries > 0 && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handlePickWinner(d.id)}
                          disabled={pickingId === d.id}
                          style={{ background: 'rgba(0,212,255,0.15)', borderColor: 'var(--color-accent-secondary)', color: 'var(--color-accent-secondary)' }}
                        >
                          {pickingId === d.id ? 'Picking…' : '🎲 Pick Winner'}
                        </button>
                      )}
                      {d.status === 'CLOSED' && d.winner && (
                        <Link
                          href={`/draws/${d.id}/winner?admin=1`}
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--color-accent-primary)' }}
                        >
                          🏆 Winner Card
                        </Link>
                      )}
                      <Link
                        href={`/admin/draws/${d.id}`}
                        className="btn btn-ghost btn-sm"
                      >
                        Entries
                      </Link>
                      {d.status !== 'ARCHIVED' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleArchive(d.id)}
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-lg)',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: 'var(--space-lg)', fontSize: '1.1rem', fontWeight: 700 }}>
              {editingId ? 'Edit Draw' : 'Create Draw'}
            </h2>

            {error && (
              <div className="alert" style={{ marginBottom: 'var(--space-md)', background: 'rgba(255,59,48,0.1)', borderColor: 'var(--color-accent-error)', color: 'var(--color-accent-error)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Title *</label>
                <input
                  className="form-input"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Summer Giveaway"
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Optional description…"
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Prize *</label>
                <input
                  className="form-input"
                  value={form.prize}
                  onChange={(e) => setForm({ ...form, prize: e.target.value })}
                  placeholder="5 hours free gaming + snacks"
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as DrawStatus })}
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Starts At</label>
                <input
                  className="form-input"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Ends At</label>
                <input
                  className="form-input"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-md)' }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Draw'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            zIndex: 300, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 'var(--space-lg)',
          }}
          onClick={() => setConfirmModal(null)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 420, padding: 'var(--space-xl)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 'var(--space-sm)' }}>
              {confirmModal.title}
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xl)', fontSize: '0.9rem' }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmModal(null)}>
                Cancel
              </button>
              <button
                className={`btn ${confirmModal.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={confirmModal.onConfirm}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
