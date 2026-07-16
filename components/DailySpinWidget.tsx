'use client';

import { useState, useEffect, useRef } from 'react';
import { Gift, Clock, Share2 } from 'lucide-react';
import { useSession } from 'next-auth/react';

type LootItem = {
  id: string;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  rarity?: string | null;
};

type SpinStatus = {
  enabled: boolean;
  canSpin: boolean;
  spin: any;
  remainingRetries: number;
  nextReset: string;
  lootItems?: LootItem[];
  streak?: {
    current: number;
    target: number;
    guaranteedToday: boolean;
    spinsRemaining: number;
  };
};

const RARITY_COLORS: Record<string, string> = {
  LEGENDARY: '#f59e0b',
  EPIC:      '#a855f7',
  RARE:      '#3b82f6',
  UNCOMMON:  '#22c55e',
  COMMON:    '#6b7280',
};

const RARITY_EMOJI: Record<string, string> = {
  LEGENDARY: '🏆',
  EPIC:      '💜',
  RARE:      '💎',
  UNCOMMON:  '⭐',
  COMMON:    '🎁',
};

function rarityColor(item: LootItem) {
  return RARITY_COLORS[(item.rarity ?? 'COMMON').toUpperCase()] ?? RARITY_COLORS.COMMON;
}

function rarityEmoji(item: LootItem) {
  return RARITY_EMOJI[(item.rarity ?? 'COMMON').toUpperCase()] ?? '🎁';
}

// How many cells we display (pad with repeats if fewer items)
const GRID_COLS = 3;
const MIN_CELLS = 3;

export function DailySpinWidget() {
  const { data: session, status: sessionStatus } = useSession();
  const [spinStatus, setSpinStatus] = useState<SpinStatus | null>(null);
  const [loading, setLoading]       = useState(true);
  const [spinning, setSpinning]     = useState(false);
  const [reward, setReward]         = useState<LootItem | null>(null);
  const [error, setError]           = useState('');
  const [timeLeft, setTimeLeft]     = useState('');
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [streakReward, setStreakReward] = useState(false);

  const spinIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = async () => {
    if (sessionStatus !== 'authenticated') { setLoading(false); return; }
    try {
      const res  = await fetch('/api/daily-spin');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSpinStatus(data);
      setStreakReward(false);
      if (data.spin) setReward(data.spin.lootItem);
    } catch (err: any) {
      setError(err.message || 'Failed to load status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionStatus !== 'loading') loadStatus();
  }, [sessionStatus]);

  useEffect(() => {
    if (!spinStatus?.nextReset || !reward) return;
    const interval = setInterval(() => {
      const distance = new Date(spinStatus.nextReset).getTime() - Date.now();
      if (distance < 0) { clearInterval(interval); setTimeLeft('EXPIRED'); loadStatus(); return; }
      const h = Math.floor((distance % 86400000) / 3600000);
      const m = Math.floor((distance % 3600000) / 60000);
      const s = Math.floor((distance % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [spinStatus?.nextReset, reward]);

  // Build the display grid (pad/repeat items to MIN_CELLS)
  const rawItems: LootItem[] = spinStatus?.lootItems ?? [];
  const gridItems: LootItem[] = rawItems.length === 0 ? [] : (() => {
    const cells: LootItem[] = [];
    const total = Math.max(MIN_CELLS, Math.ceil(rawItems.length / GRID_COLS) * GRID_COLS);
    for (let i = 0; i < total; i++) cells.push(rawItems[i % rawItems.length]);
    return cells;
  })();

  const handleSpin = () => {
    if (!spinStatus?.canSpin || spinning) return;
    setSpinning(true);
    setError('');
    setReward(null);

    const totalCells = gridItems.length;
    if (totalCells === 0) {
      setSpinning(false);
      return;
    }

    // Start animation immediately (before API response)
    let current = 0;
    let delay   = 60; // start fast
    let steps   = 0;
    const totalSteps = 28;
    let wonItem: LootItem | null = null;
    let landIndex = 0;

    const animate = () => {
      current = Math.floor(Math.random() * totalCells);
      setHighlighted(current);
      steps++;

      // In last 8 steps, slow down and converge toward winner cell
      if (steps >= totalSteps - 8) {
        delay = 120 + (steps - (totalSteps - 8)) * 80;
      }

      if (steps < totalSteps) {
        spinIntervalRef.current = setTimeout(animate, delay);
      } else {
        // Final: lock on winner
        setHighlighted(landIndex);
        setTimeout(() => {
          setReward(wonItem);
          loadStatus();
          setSpinning(false);
        }, 600);
      }
    };

    // Start animation immediately
    spinIntervalRef.current = setTimeout(animate, delay);

    // Fetch winner in background (non-blocking)
    fetch('/api/daily-spin', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (!data.reward) throw new Error(data.error || 'No reward data');
        wonItem = data.reward as LootItem;
        setStreakReward(Boolean(data.streakReward));
        if (data.streak) {
          setSpinStatus((prev) => prev ? { ...prev, streak: data.streak } : prev);
        }
        // Find first cell index that matches the winner
        const winnerCellIndex = gridItems.findIndex((item) => item.id === wonItem!.id);
        landIndex = winnerCellIndex >= 0 ? winnerCellIndex : 0;
      })
      .catch(err => {
        setError(err.message || 'Spin failed');
      });
  };

  const shareReward = async () => {
    if (!reward) return;
    const text = `I just won ${reward.name} in the GameZone Daily Guild Spin! 🎮✨`;
    if (navigator.share) {
      try { await navigator.share({ title: 'GameZone Loot', text, url: window.location.href }); }
      catch { navigator.clipboard.writeText(text); }
    } else {
      navigator.clipboard.writeText(text);
      alert('Result copied to clipboard!');
    }
  };

  useEffect(() => {
    return () => { if (spinIntervalRef.current) clearTimeout(spinIntervalRef.current); };
  }, []);

  if (loading || sessionStatus === 'loading') {
    return <div className="loading-state"><div className="spinner" />Loading Spin...</div>;
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
        <Gift size={48} style={{ color: 'var(--color-accent-primary)', margin: '0 auto var(--space-md)' }} />
        <h2 style={{ fontSize: '1.5rem', marginBottom: 'var(--space-md)' }}>Login Required</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>
          You must be logged in to claim your daily loot spin!
        </p>
        <a href="/login?callbackUrl=/daily-spin" className="btn btn-primary">Login to Spin</a>
      </div>
    );
  }

  if (spinStatus && !spinStatus.enabled) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
        <Gift size={48} style={{ color: 'var(--color-text-muted)', margin: '0 auto var(--space-md)' }} />
        <h2>Daily Guild Spin Disabled</h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>The Daily Guild Spin feature is currently disabled by the administrator.</p>
      </div>
    );
  }

  const GRID_ROWS = gridItems.length > 0 ? Math.ceil(gridItems.length / GRID_COLS) : 2;

  return (
    <div style={{
      maxWidth: 620,
      margin: '0 auto',
      background: 'var(--color-bg-card)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-2xl)',
      boxShadow: 'var(--shadow-glow)',
      border: '1px solid var(--color-border-accent)',
      position: 'relative',
      overflow: 'hidden',
      textAlign: 'center',
    }}>
      {/* Glow bg */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 340, height: 340,
        background: 'var(--color-accent-primary)',
        filter: 'blur(120px)',
        opacity: spinning ? 0.22 : 0.07,
        transition: 'opacity 0.8s ease',
        zIndex: 0, pointerEvents: 'none',
      }} />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cellPop  { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @keyframes winPop   { 0% { transform: scale(0.85); opacity: 0; } 80% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes shimmer  { 0%,100% { box-shadow: 0 0 12px 2px var(--hl-color); } 50% { box-shadow: 0 0 22px 6px var(--hl-color); } }
        .spin-cell-highlighted { animation: cellPop 0.25s ease, shimmer 0.5s ease infinite; }
        .spin-cell-winner      { animation: winPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards; }
        .reward-reveal         { animation: winPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards; }
      ` }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <h2 style={{
          fontSize: '2rem', fontWeight: 900, fontFamily: 'Orbitron, sans-serif',
          textTransform: 'uppercase', letterSpacing: '2px',
          background: 'var(--gradient-primary)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: 'var(--space-sm)',
        }}>
          Daily Guild Spin
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xl)' }}>
          {spinStatus?.canSpin
            ? 'Test your luck — spin the grid to win a free perk!'
            : 'Come back tomorrow for another drop!'}
        </p>
        {spinStatus?.streak && (
          <div
            style={{
              marginBottom: 'var(--space-lg)',
              padding: '16px',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid rgba(168,85,247,0.18)',
              background: 'linear-gradient(180deg, rgba(168,85,247,0.10), rgba(15,23,42,0.16))',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                marginBottom: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#d8b4fe' }}>
                  Streak To Epic
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>
                  Day {Math.min(spinStatus.streak.current, spinStatus.streak.target)} / {spinStatus.streak.target}
                </div>
              </div>
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: spinStatus.streak.guaranteedToday ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${spinStatus.streak.guaranteedToday ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  color: spinStatus.streak.guaranteedToday ? '#f5d0fe' : 'var(--color-text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {spinStatus.streak.guaranteedToday ? 'Epic Ready' : `${spinStatus.streak.spinsRemaining} Days Left`}
              </div>
            </div>

            <div
              style={{
                position: 'relative',
                height: 10,
                borderRadius: 999,
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  width: `${Math.max(6, Math.min(100, (spinStatus.streak.current / spinStatus.streak.target) * 100))}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, #7c3aed, #c084fc)',
                  transition: 'width 220ms ease',
                }}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${spinStatus.streak.target}, minmax(0, 1fr))`,
                gap: 6,
                marginBottom: 12,
              }}
            >
              {Array.from({ length: spinStatus.streak.target }, (_, index) => {
                const day = index + 1;
                const completed = day <= spinStatus.streak.current;
                const finalDay = day === spinStatus.streak.target;

                return (
                  <div
                    key={day}
                    title={`Day ${day}`}
                    style={{
                      height: 24,
                      borderRadius: 999,
                      border: `1px solid ${
                        finalDay
                          ? 'rgba(168,85,247,0.5)'
                          : completed
                          ? 'rgba(192,132,252,0.35)'
                          : 'rgba(255,255,255,0.08)'
                      }`,
                      background: finalDay
                        ? completed
                          ? 'linear-gradient(180deg, rgba(168,85,247,0.95), rgba(126,34,206,0.9))'
                          : 'rgba(168,85,247,0.10)'
                        : completed
                        ? 'rgba(192,132,252,0.24)'
                        : 'rgba(255,255,255,0.03)',
                      color: finalDay ? '#fdf4ff' : completed ? '#f5d0fe' : 'var(--color-text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                    }}
                  >
                    {finalDay ? 'EPIC' : day}
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: '0.82rem', color: '#e9d5ff' }}>
              {spinStatus.streak.guaranteedToday
                ? 'Spin today and the reward will be guaranteed from the epic pool.'
                : `Keep the streak alive for ${spinStatus.streak.spinsRemaining} more day${spinStatus.streak.spinsRemaining === 1 ? '' : 's'} to unlock a guaranteed epic reward.`}
            </div>
          </div>
        )}
        <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)', textAlign: 'left', fontSize: '0.86rem' }}>
          Daily spin gifts are redeemable only with a booking made on the same day. Missing a day breaks the streak, and epic-tier drops reset it.
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-lg)' }}>{error}</div>}

        {/* ── Loot Grid ── */}
        {gridItems.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
            gap: 10,
            marginBottom: 'var(--space-xl)',
          }}>
            {gridItems.map((item, i) => {
              const isHighlighted = highlighted === i && spinning;
              const isWinner      = !spinning && reward && item.id === reward.id && highlighted === i;
              const color         = rarityColor(item);

              return (
                <div
                  key={i}
                  className={isHighlighted ? 'spin-cell-highlighted' : isWinner ? 'spin-cell-winner' : ''}
                  style={{
                    '--hl-color': color,
                    padding: '12px 8px',
                    borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${isHighlighted || isWinner ? color : 'rgba(255,255,255,0.08)'}`,
                    background: isHighlighted
                      ? `${color}22`
                      : isWinner
                      ? `${color}33`
                      : 'rgba(255,255,255,0.03)',
                    transition: 'background 0.15s, border-color 0.15s',
                    cursor: 'default',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 90,
                    justifyContent: 'center',
                  } as React.CSSProperties}
                >
                  <div style={{ fontSize: '1.6rem', lineHeight: 1 }}>
                    {item.iconUrl
                      ? <img src={item.iconUrl} alt={item.name} style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4 }} />
                      : rarityEmoji(item)
                    }
                  </div>
                  <div style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: isHighlighted || isWinner ? color : 'var(--color-text-secondary)',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    wordBreak: 'break-word',
                    maxWidth: '100%',
                    transition: 'color 0.15s',
                  }}>
                    {item.name}
                  </div>
                  {item.rarity && item.rarity !== 'COMMON' && (
                    <div style={{
                      fontSize: '0.58rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color,
                      opacity: 0.8,
                    }}>
                      {item.rarity}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            height: 180,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)',
            marginBottom: 'var(--space-xl)',
          }}>
            No loot items configured yet.
          </div>
        )}

        {/* Spin button */}
        {!reward && spinStatus?.canSpin && (
          <button
            className="btn btn-primary"
            style={{ padding: '16px 48px', fontSize: '1.1rem', fontFamily: 'Orbitron, sans-serif', opacity: spinning ? 0.7 : 1 }}
            onClick={handleSpin}
            disabled={spinning}
          >
            {spinning ? 'Spinning...' : '⚡ SPIN NOW'}
          </button>
        )}

        {/* Reward reveal */}
        {reward && !spinning && (
          <div className="reward-reveal" style={{
            background: `${rarityColor(reward)}12`,
            padding: 'var(--space-lg)',
            borderRadius: 'var(--radius-lg)',
            border: `1px solid ${rarityColor(reward)}55`,
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 4 }}>
              {reward.iconUrl
                ? <img src={reward.iconUrl} alt={reward.name} style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 6, display: 'inline-block' }} />
                : rarityEmoji(reward)
              }
            </div>
            <h3 style={{ fontSize: '1.4rem', color: rarityColor(reward), marginBottom: 'var(--space-xs)' }}>
              🎉 {reward.name}
            </h3>
            {streakReward && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 999,
                  background: 'rgba(168,85,247,0.14)',
                  border: '1px solid rgba(168,85,247,0.35)',
                  color: '#f5d0fe',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  marginBottom: 'var(--space-sm)',
                }}
              >
                Guaranteed streak epic unlocked
              </div>
            )}
            {reward.description && (
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)', fontSize: '0.9rem' }}>
                {reward.description}
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-accent-warning)', fontSize: '0.9rem', marginBottom: 'var(--space-md)' }}>
              <Clock size={16} /> Next drop in: {timeLeft || 'Calculating...'}
            </div>
            <div className="alert alert-info" style={{ fontSize: '0.85rem', marginBottom: 'var(--space-md)', textAlign: 'left' }}>
              <strong>How to claim:</strong> Show this to EMI Guild staff at the front desk. Daily spin gifts are valid only with a same-day booking.
            </div>
            <button className="btn btn-secondary btn-sm" onClick={shareReward}>
              <Share2 size={16} /> Share Result
            </button>
          </div>
        )}

        {!spinStatus?.canSpin && !spinning && !reward && spinStatus?.spin && (
          <div style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-md)' }}>
            You have already claimed your daily drop. Check back later!
          </div>
        )}
      </div>
    </div>
  );
}
