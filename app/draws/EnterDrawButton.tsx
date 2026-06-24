'use client'

import { useState } from 'react'

interface Props {
  drawId: string
  alreadyEntered: boolean
}

export default function EnterDrawButton({ drawId, alreadyEntered }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'entered' | 'duplicate' | 'error'>(
    alreadyEntered ? 'entered' : 'idle'
  )

  const handleEnter = async () => {
    setState('loading')
    try {
      const res = await fetch('/api/draws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawId }),
      })
      if (res.status === 201) {
        setState('entered')
      } else if (res.status === 409) {
        setState('duplicate')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  if (state === 'entered' || state === 'duplicate') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 20px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(0,230,118,0.12)',
          border: '1px solid var(--color-accent-success)',
          color: 'var(--color-accent-success)',
          fontWeight: 600,
          fontSize: '0.95rem',
        }}
      >
        ✅ {state === 'entered' ? "You're in! 🎉" : 'Already entered'}
      </span>
    )
  }

  return (
    <button
      className="btn btn-primary"
      onClick={handleEnter}
      disabled={state === 'loading'}
      style={{ minWidth: 160 }}
    >
      {state === 'loading' ? 'Entering…' : '🎁 Enter Draw'}
    </button>
  )
}
