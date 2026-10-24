'use client';

import { useState, useEffect, useRef } from 'react';
import { Gift } from 'lucide-react';
import { SpinPresentation } from './rewards/SpinPresentation';
import { animateDailySpin, executeDailyReward } from '@/lib/daily-reward-client';
import { useSession } from 'next-auth/react';
import { GuildSpinRouteLoader } from '@/components/GuildSpinLoadingBoundary';

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

  const spinAbortRef = useRef<AbortController | null>(null);
  const spinBusyRef = useRef(false);

  const loadStatus = async () => {
    if (sessionStatus !== 'authenticated') { setLoading(false); return; }
    try {
      const res  = await fetch('/api/daily-spin');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSpinStatus(data);
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

  const handleSpin = async () => {
    if (!spinStatus?.canSpin || spinBusyRef.current || !session?.user?.id) return;
    spinBusyRef.current = true;
    setSpinning(true);
    setError('');
    setReward(null);
    setStreakReward(false);
    const controller = new AbortController();
    spinAbortRef.current = controller;
    try {
      const data = await animateDailySpin(gridItems,
        executeDailyReward('spin', session.user.id) as Promise<{ reward: LootItem; streakReward?: boolean; streak?: SpinStatus['streak'] }>,
        setHighlighted, controller.signal, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      setReward(data.reward);
      setStreakReward(Boolean(data.streakReward));
      if (data.streak) setSpinStatus(prev => prev ? { ...prev, streak: data.streak, canSpin: false } : prev);
      void loadStatus();
    } catch (cause) {
      if (!controller.signal.aborted) { setHighlighted(null); setError(cause instanceof Error ? cause.message : 'Spin failed'); }
    } finally {
      spinBusyRef.current = false;
      if (!controller.signal.aborted) setSpinning(false);
    }
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
    return () => { spinAbortRef.current?.abort(); };
  }, []);

  if (loading || sessionStatus === 'loading') {
    return <GuildSpinRouteLoader />;
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

  const streak = spinStatus?.streak;

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
            ? 'Daily spin available — one spin each day.'
            : 'Today’s spin used. Come back after the daily reset.'}
        </p>
        {streak && (
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
                  Day {Math.min(streak.current, streak.target)} / {streak.target}
                </div>
              </div>
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: streak.guaranteedToday ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${streak.guaranteedToday ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  color: streak.guaranteedToday ? '#f5d0fe' : 'var(--color-text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {streak.guaranteedToday ? 'Epic Ready' : `${streak.spinsRemaining} Days Left`}
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
                  width: `${Math.max(6, Math.min(100, (streak.current / streak.target) * 100))}%`,
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
                gridTemplateColumns: `repeat(${streak.target}, minmax(0, 1fr))`,
                gap: 6,
                marginBottom: 12,
              }}
            >
              {Array.from({ length: streak.target }, (_, index) => {
                const day = index + 1;
                const completed = day <= streak.current;
                const finalDay = day === streak.target;

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
                    {finalDay ? '💜' : day}
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: '0.82rem', color: '#e9d5ff' }}>
              {streak.guaranteedToday
                ? 'Spin today and the reward will be guaranteed from the epic pool.'
                : `Keep the streak alive for ${streak.spinsRemaining} more day${streak.spinsRemaining === 1 ? '' : 's'} to unlock a guaranteed epic reward.`}
            </div>
          </div>
        )}
        <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)', textAlign: 'left', fontSize: '0.86rem' }}>
          Daily spin gifts are redeemable only with a booking made on the same day. Missing a day breaks the streak, and epic-tier drops reset it.
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-lg)' }}>{error}</div>}

        <SpinPresentation gridItems={gridItems} highlighted={highlighted} spinning={spinning} reward={reward} streakReward={streakReward} timeLeft={timeLeft} shareReward={shareReward} />

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

        {!spinStatus?.canSpin && !spinning && !reward && spinStatus?.spin && (
          <div style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-md)' }}>
            You have already claimed your daily drop. Check back later!
          </div>
        )}
      </div>
    </div>
  );
}
