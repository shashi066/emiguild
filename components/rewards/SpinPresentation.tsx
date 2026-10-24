'use client';
import { Clock, Share2 } from 'lucide-react';
type LootItem = {
  id: string;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  rarity?: string | null;
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


export function SpinPresentation({ gridItems, highlighted, spinning, reward, streakReward = false, timeLeft = '', shareReward }: {
  gridItems: LootItem[]; highlighted: number | null; spinning: boolean; reward: LootItem | null;
  streakReward?: boolean; timeLeft?: string; shareReward?: () => void;
}) {
  const restoredWinnerIndex = reward ? gridItems.findIndex(item => item.id === reward.id) : -1;
  const GRID_COLS = 3;
  return <div className="spin-presentation">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cellPop  { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @keyframes winPop   { 0% { transform: scale(0.85); opacity: 0; } 80% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
        .spin-presentation .spin-cell-highlighted { animation: cellPop 0.25s ease; }
        .spin-presentation .spin-cell-winner { position: relative; z-index: 2; animation: winPop 0.3s ease both; outline: 2px solid var(--hl-color); outline-offset: 2px; }
        .reward-reveal         { animation: winPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards; }
      ` }} />

        {/* ── Loot Grid ── */}
        {gridItems.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            gap: 10,
            marginBottom: 'var(--space-xl)',
          }}>
            {gridItems.map((item, i) => {
              const isHighlighted = highlighted === i && spinning;
              const displayedWinnerIndex = highlighted !== null && gridItems[highlighted]?.id === reward?.id
                ? highlighted
                : restoredWinnerIndex;
              const isWinner      = !spinning && reward && i === displayedWinnerIndex;
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
                    transition: 'none',
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
                      ? <img src={item.iconUrl} decoding="async" alt="" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4 }} />
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
                    transition: 'none',
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
            {reward ? 'Your saved reward' : 'No loot items configured yet.'}
          </div>
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
                ? <img src={reward.iconUrl} decoding="async" alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 6, display: 'inline-block' }} />
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
            {timeLeft && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-accent-warning)', fontSize: '0.9rem', marginBottom: 'var(--space-md)' }}>
              <Clock size={16} /> Next spin in: {timeLeft}
            </div>}
            <div className="alert alert-info" style={{ fontSize: '0.85rem', marginBottom: 'var(--space-md)', textAlign: 'left' }}>
              <strong>How to claim:</strong> Show this to EMI Guild staff at the front desk. Daily spin gifts are valid only with a same-day booking.
            </div>
            {shareReward && <button className="btn btn-secondary btn-sm" onClick={shareReward}>
              <Share2 size={16} /> Share Result
            </button>}
          </div>
        )}

<style>{`@media(prefers-reduced-motion:reduce) { .spin-presentation * { animation: none !important; transition: none !important; } }`}</style></div>;
}
