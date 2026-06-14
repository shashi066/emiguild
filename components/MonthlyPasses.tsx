'use client';

import { useState } from 'react';
import { X, Star, Clock, Calendar, Phone, CheckCircle, Award } from 'lucide-react';

const PASSES = [
  {
    id: 'bronze',
    name: 'Bronze Pass',
    hours: 10,
    price: 1300,
    pricePerHr: 130,
    color: '#cd7f32',
    glow: 'rgba(205,127,50,0.25)',
    border: 'rgba(205,127,50,0.4)',
    bg: 'rgba(205,127,50,0.06)',
    icon: '🥉',
    badge: 'Starter',
    perks: [
      '10 hours of gaming',
      'Valid on weekdays (Mon–Fri)',
      'Valid for 30 days',
      'No per-day hour limit',
      'All stations included',
    ],
  },
  {
    id: 'silver',
    name: 'Silver Pass',
    hours: 20,
    price: 2300,
    pricePerHr: 115,
    color: '#a8a9ad',
    glow: 'rgba(168,169,173,0.25)',
    border: 'rgba(168,169,173,0.4)',
    bg: 'rgba(168,169,173,0.06)',
    icon: '🥈',
    badge: 'Popular',
    featured: true,
    perks: [
      '20 hours of gaming',
      'Valid on weekdays (Mon–Fri)',
      'Valid for 30 days',
      'No per-day hour limit',
      'All stations included',
    ],
  },
  {
    id: 'gold',
    name: 'Gold Pass',
    hours: 30,
    price: 3000,
    pricePerHr: 100,
    color: '#FFD700',
    glow: 'rgba(255,215,0,0.2)',
    border: 'rgba(255,215,0,0.4)',
    bg: 'rgba(255,215,0,0.05)',
    icon: '🥇',
    badge: 'Best Value',
    perks: [
      '30 hours of gaming',
      'Valid on weekdays (Mon–Fri)',
      'Valid for 30 days',
      'No per-day hour limit',
      'All stations included',
    ],
  },
];

export default function MonthlyPasses() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        id="monthly-passes-btn"
        style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          8,
          padding:      '12px 24px',
          borderRadius: 'var(--radius-lg)',
          background:   'linear-gradient(135deg, rgba(255,215,0,0.12), rgba(205,127,50,0.12))',
          border:       '1px solid rgba(255,215,0,0.35)',
          color:        '#FFD700',
          fontWeight:   700,
          fontSize:     '0.95rem',
          cursor:       'pointer',
          transition:   'all 0.2s ease',
          letterSpacing: '0.01em',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(205,127,50,0.2))';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 20px rgba(255,215,0,0.2)';
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(255,215,0,0.12), rgba(205,127,50,0.12))';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
        }}
      >
        <Award size={18} />
        Monthly Passes
      </button>

      {/* Modal */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, overflowY: 'auto',
          }}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div style={{
            width: '100%', maxWidth: 900,
            animation: 'fadeInUp 0.25s ease',
          }}>
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 28,
            }}>
              <div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: '#FFD700',
                  background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)',
                  padding: '4px 12px', borderRadius: '999px', marginBottom: 10,
                }}>
                  <Star size={11} fill="#FFD700" /> Membership Plans
                </div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
                  Monthly Gaming Passes
                </h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: 6 }}>
                  Buy hours in bulk and save more. Valid on weekdays only.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '50%', width: 36, height: 36,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--color-text-muted)', flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Pass cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 20,
            }}>
              {PASSES.map((pass) => (
                <div
                  key={pass.id}
                  style={{
                    position: 'relative',
                    background: `var(--color-bg-card)`,
                    border: `1px solid ${pass.featured ? pass.border : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-xl)',
                    padding: '28px 24px',
                    boxShadow: pass.featured ? `0 0 30px ${pass.glow}` : 'none',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    overflow: 'hidden',
                  }}
                >
                  {/* Subtle background tint */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: pass.bg,
                    borderRadius: 'inherit',
                    pointerEvents: 'none',
                  }} />

                  {/* Badge */}
                  <div style={{
                    position: 'absolute', top: 16, right: 16,
                    background: pass.bg,
                    border: `1px solid ${pass.border}`,
                    color: pass.color,
                    fontSize: '0.68rem', fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    padding: '3px 10px', borderRadius: '999px',
                  }}>
                    {pass.badge}
                  </div>

                  <div style={{ position: 'relative' }}>
                    {/* Icon + name */}
                    <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>{pass.icon}</div>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--color-text-primary)', marginBottom: 4 }}>
                      {pass.name}
                    </div>

                    {/* Price */}
                    <div style={{ marginBottom: 20 }}>
                      <span style={{ fontSize: '2rem', fontWeight: 900, color: pass.color }}>
                        ₹{pass.price.toLocaleString('en-IN')}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginLeft: 6 }}>
                        / 30 days
                      </span>
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        ₹{pass.pricePerHr}/hr  ·  {pass.hours} hours total
                      </div>
                    </div>

                    {/* Info chips */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: '0.75rem', fontWeight: 600,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        padding: '4px 10px', borderRadius: '999px', color: 'var(--color-text-secondary)',
                      }}>
                        <Clock size={11} /> {pass.hours} hrs
                      </span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: '0.75rem', fontWeight: 600,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        padding: '4px 10px', borderRadius: '999px', color: 'var(--color-text-secondary)',
                      }}>
                        <Calendar size={11} /> 30 Days
                      </span>
                    </div>

                    {/* Perks */}
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {pass.perks.map((perk) => (
                        <li key={perk} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                          <CheckCircle size={13} style={{ color: pass.color, flexShrink: 0 }} />
                          {perk}
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <a
                      href="tel:+919989562474"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        width: '100%', padding: '11px 16px',
                        borderRadius: 'var(--radius-md)',
                        background: pass.featured
                          ? `linear-gradient(135deg, ${pass.color}, ${pass.color}cc)`
                          : pass.bg,
                        border: `1px solid ${pass.border}`,
                        color: pass.featured ? '#000' : pass.color,
                        fontWeight: 700, fontSize: '0.875rem',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        transition: 'opacity 0.15s',
                      }}
                    >
                      <Phone size={14} />
                      Call to Purchase
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer note */}
            <div style={{
              marginTop: 20, padding: '14px 20px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem', color: 'var(--color-text-muted)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Calendar size={14} style={{ color: '#FFD700', flexShrink: 0 }} />
              <span>
                <strong style={{ color: 'var(--color-text-secondary)' }}>Weekdays Only (Mon–Fri) · </strong>
                Passes are valid for 30 days from date of purchase. Hours can be used across multiple visits with no daily limit. Call us to buy your pass.
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
