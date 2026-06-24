'use client'

import { useState } from 'react'

interface Props {
  winnerName: string
  drawTitle: string
  prize: string
  phone: string
}

export default function WinnerCardActions({ winnerName, drawTitle, prize, phone }: Props) {
  const [copied, setCopied] = useState(false)

  const details = `🏆 Guild Drop Winner\n\nDraw: ${drawTitle}\nWinner: ${winnerName}\nPhone: ${phone}\nPrize: ${prize}`

  const handlePrint = () => window.print()

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `Winner: ${drawTitle}`, text: details })
      } catch {
        // user cancelled — ignore
      }
    } else {
      handleCopy()
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(details)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available
    }
  }

  return (
    <div
      className="no-print"
      style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'center', flexWrap: 'wrap', marginTop: 'var(--space-md)' }}
    >
      <button className="btn btn-ghost btn-sm" onClick={handlePrint}>
        🖨️ Print / Save as PDF
      </button>
      <button className="btn btn-ghost btn-sm" onClick={handleShare}>
        🔗 Share
      </button>
      <button className="btn btn-ghost btn-sm" onClick={handleCopy}>
        {copied ? '✅ Copied!' : '📋 Copy Details'}
      </button>
    </div>
  )
}
