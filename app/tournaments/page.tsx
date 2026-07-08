'use client';

import { Trophy, Clock, Mail } from 'lucide-react';

export default function TournamentsPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--space-3xl)', paddingBottom: 'var(--space-3xl)' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        {/* Coming Soon Card */}
        <div className="card card-glass coming-soon-card" style={{
          padding: 'var(--space-3xl)',
        }}>
          {/* Animated Background */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, rgba(108,99,255,0.1) 0%, rgba(168,85,247,0.1) 50%, rgba(255,215,0,0.05) 100%)',
            zIndex: 0,
          }} />

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Trophy Icon with Animation */}
            <div className="trophy-icon-glow" style={{
              width: '80px',
              height: '80px',
              margin: '0 auto var(--space-xl)',
              background: 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,165,0,0.1))',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid rgba(255,215,0,0.3)',
            }}>
              <Trophy size={40} color="#FFD700" />
            </div>

            {/* Title */}
            <h1 style={{
              fontSize: '2rem',
              fontWeight: 700,
              marginBottom: 'var(--space-md)',
              background: 'linear-gradient(135deg, #fff, #a78bfa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Tournament Mode
            </h1>

            {/* Coming Soon Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              padding: '8px 20px',
              background: 'rgba(108,99,255,0.15)',
              border: '1px solid rgba(108,99,255,0.3)',
              borderRadius: 'var(--radius-full)',
              marginBottom: 'var(--space-xl)',
            }}>
              <Clock size={16} color="#a78bfa" />
              <span style={{ color: '#a78bfa', fontSize: '0.9rem', fontWeight: 500 }}>
                Coming Soon
              </span>
            </div>

            {/* Description */}
            <p style={{
              color: 'var(--color-text-secondary)',
              fontSize: '1rem',
              lineHeight: 1.7,
              marginBottom: 'var(--space-xl)',
            }}>
              Get ready for epic gaming competitions! We're working on exciting tournaments 
              where you can compete against other gamers, win exclusive prizes, and prove your skills.
            </p>

            {/* Features Preview */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 'var(--space-md)',
              marginBottom: 'var(--space-xl)',
            }}>
              {[
                { label: 'Weekly Events', emoji: '🏆' },
                { label: 'Cash Prizes', emoji: '💰' },
                { label: 'Leaderboards', emoji: '📊' },
              ].map((feature, index) => (
                <div key={index} style={{
                  padding: 'var(--space-md)',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{feature.emoji}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{feature.label}</div>
                </div>
              ))}
            </div>

            {/* Notify Section */}
            <div style={{
              padding: 'var(--space-lg)',
              background: 'rgba(255,215,0,0.05)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(255,215,0,0.1)',
            }}>
              <p style={{
                color: 'var(--color-text-secondary)',
                fontSize: '0.9rem',
                marginBottom: 'var(--space-md)',
              }}>
                Want to be the first to know when tournaments launch?
              </p>
              <button 
                className="notify-btn"
                disabled
                style={{ cursor: 'not-allowed', opacity: 0.6 }}
              >
                <Mail size={16} />
                Get Notified
              </button>
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div style={{ marginTop: 'var(--space-xl)' }}>
          <a 
            href="/" 
            style={{
              color: 'var(--color-text-muted)',
              textDecoration: 'none',
              fontSize: '0.9rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              transition: 'color 0.2s ease',
            }}
            onMouseOver={(e) => e.currentTarget.style.color = 'var(--color-text-primary)'}
            onMouseOut={(e) => e.currentTarget.style.color = 'var(--color-text-muted)'}
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}