import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Award, Clock, Calendar, Phone, CheckCircle,
  Star, Zap, ArrowRight, ArrowLeft,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Monthly Gaming Passes',
  description: 'Buy gaming hours in bulk with our Bronze, Silver, Gold, Black and Apex monthly passes. Valid on weekdays for 30 days with no daily hour restrictions.',
};

const PASSES = [
  {
    id: 'bronze',
    icon: '🥉',
    name: 'Bronze Pass',
    badge: 'Starter',
    hours: 10,
    price: 1300,
    pricePerHr: 130,
    color: '#cd7f32',
    borderColor: 'rgba(205,127,50,0.4)',
    bgColor: 'rgba(205,127,50,0.07)',
    glowColor: 'rgba(205,127,50,0.15)',
    featured: false,
  },
  {
    id: 'silver',
    icon: '🥈',
    name: 'Silver Pass',
    badge: 'Most Popular',
    hours: 20,
    price: 2300,
    pricePerHr: 115,
    color: '#c0c0c0',
    borderColor: 'rgba(192,192,192,0.5)',
    bgColor: 'rgba(192,192,192,0.07)',
    glowColor: 'rgba(192,192,192,0.15)',
    featured: true,
  },
  {
    id: 'gold',
    icon: '🥇',
    name: 'Gold Pass',
    badge: 'Best Value',
    hours: 30,
    price: 3000,
    pricePerHr: 100,
    color: '#FFD700',
    borderColor: 'rgba(255,215,0,0.45)',
    bgColor: 'rgba(255,215,0,0.07)',
    glowColor: 'rgba(255,215,0,0.18)',
    featured: false,
  },
] as const;

const RACING_PASSES = [
  {
    id: 'black',
    icon: '🖤',
    name: 'Black Pass',
    badge: 'Starter',
    line: 'Built for casual racers who want more track time.',
    hours: 10,
    price: 2400,
    pricePerHr: 240,
    savings: 600,
    discount: '20% OFF',
    color: '#d8dee9',
    borderColor: 'rgba(124, 134, 154, 0.42)',
    bgColor: 'linear-gradient(135deg, rgba(15,18,28,0.92), rgba(38,43,58,0.72))',
    glowColor: 'rgba(124, 134, 154, 0.22)',
    featured: false,
  },
  {
    id: 'apex',
    icon: '⚡',
    name: 'Apex Pass',
    badge: 'Best Value',
    line: 'For racers who want maximum speed, sessions, and savings.',
    hours: 15,
    price: 3150,
    pricePerHr: 210,
    savings: 1350,
    discount: '30% OFF',
    color: '#67e8f9',
    borderColor: 'rgba(34, 211, 238, 0.42)',
    bgColor: 'linear-gradient(135deg, rgba(8,34,44,0.92), rgba(0,153,184,0.22))',
    glowColor: 'rgba(34, 211, 238, 0.22)',
    featured: true,
  },
] as const;

const PERKS = [
  { icon: <Clock size={15} />, text: 'Use hours across multiple visits' },
  { icon: <Calendar size={15} />, text: 'Valid 30 days from purchase' },
  { icon: <Zap size={15} />, text: 'No per-day hour restrictions' },
  { icon: <CheckCircle size={15} />, text: 'All gaming stations included' },
  { icon: <Star size={15} />, text: 'Weekdays only (Mon – Fri)' },
];

export default function PassesPage() {
  return (
    <div style={{ minHeight: '100vh', paddingTop: 80 }}>
      <div className="container" style={{ marginBottom: 'var(--space-lg)' }}>
        <Link href="/" className="btn btn-ghost btn-sm">
          <ArrowLeft size={16} />
          Back to Home
        </Link>
      </div>

      {/* ── Hero ── */}
      <section
        style={{
          position: 'relative',
          padding: '72px 0 56px',
          overflow: 'hidden',
          textAlign: 'center',
          background: 'var(--color-bg-surface)',
        }}
      >
        {/* Decorative orbs */}
        <div style={{
          position: 'absolute', top: -80, left: '20%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,215,0,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -60, right: '15%',
          width: 300, height: 300, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(108,99,255,0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div className="container" style={{ position: 'relative' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: '999px',
            background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)',
            fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: '#FFD700', marginBottom: 20,
          }}>
            <Award size={13} /> Membership Plans
          </div>

          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3rem)',
            fontWeight: 900, lineHeight: 1.15,
            color: 'var(--color-text-primary)',
            marginBottom: 16,
          }}>
            Monthly Gaming{' '}
            <span style={{
              background: 'linear-gradient(135deg, #FFD700, #cd7f32)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Passes
            </span>
          </h1>

          <p style={{
            fontSize: '1.05rem', color: 'var(--color-text-secondary)',
            maxWidth: 520, margin: '0 auto 36px',
            lineHeight: 1.7,
          }}>
            Buy gaming hours in bulk and save more. Use them any time across the month
            with no daily restrictions — valid on weekdays only.
          </p>

          {/* Quick perks row */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 10,
            justifyContent: 'center',
          }}>
            {PERKS.map((p) => (
              <span
                key={p.text}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: '999px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: '0.8rem', fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                }}
              >
                <span style={{ color: '#FFD700' }}>{p.icon}</span>
                {p.text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pass Cards ── */}
      <section className="section">
        <div className="container">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
            alignItems: 'stretch',
          }}>
            {PASSES.map((pass) => (
              <div
                key={pass.id}
                style={{
                  position: 'relative',
                  background: 'var(--color-bg-card)',
                  border: `1px solid ${pass.featured ? pass.borderColor : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-xl)',
                  padding: '36px 28px 32px',
                  boxShadow: pass.featured ? `0 0 40px ${pass.glowColor}` : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  overflow: 'hidden',
                }}
              >
                {/* Background tint */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: pass.bgColor,
                  borderRadius: 'inherit',
                  pointerEvents: 'none',
                }} />

                {/* Badge */}
                <div style={{
                  position: 'absolute', top: 20, right: 20,
                  padding: '4px 12px', borderRadius: '999px',
                  background: pass.bgColor,
                  border: `1px solid ${pass.borderColor}`,
                  fontSize: '0.7rem', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: pass.color,
                }}>
                  {pass.badge}
                </div>

                <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* Icon */}
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>{pass.icon}</div>

                  {/* Name */}
                  <div style={{
                    fontSize: '1.25rem', fontWeight: 800,
                    color: 'var(--color-text-primary)', marginBottom: 4,
                  }}>
                    {pass.name}
                  </div>

                  {/* Price */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: '2.6rem', fontWeight: 900, color: pass.color, lineHeight: 1 }}>
                        ₹{pass.price.toLocaleString('en-IN')}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>/ 30 days</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                      ₹{pass.pricePerHr}/hr · {pass.hours} hours total
                    </div>
                  </div>

                  {/* Info chips */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: '999px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: '0.78rem', fontWeight: 600,
                      color: 'var(--color-text-secondary)',
                    }}>
                      <Clock size={12} style={{ color: pass.color }} />
                      {pass.hours} Hours
                    </span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: '999px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: '0.78rem', fontWeight: 600,
                      color: 'var(--color-text-secondary)',
                    }}>
                      <Calendar size={12} style={{ color: pass.color }} />
                      30 Days
                    </span>
                  </div>

                  {/* Perks list */}
                  <ul style={{
                    listStyle: 'none', padding: 0, margin: '0 0 28px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    flex: 1,
                  }}>
                    {[
                      `${pass.hours} hours of gaming`,
                      'Valid on weekdays (Mon – Fri)',
                      'Valid for 30 days from purchase',
                      'No per-day hour limit',
                      'All gaming stations included',
                    ].map((perk) => (
                      <li
                        key={perk}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          fontSize: '0.875rem', color: 'var(--color-text-secondary)',
                        }}
                      >
                        <CheckCircle size={15} style={{ color: pass.color, flexShrink: 0 }} />
                        {perk}
                      </li>
                    ))}
                  </ul>

                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 56 }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 14px', borderRadius: '999px',
                background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
                fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: '#38bdf8', marginBottom: 14,
              }}>
                <Award size={13} /> Simulator Plans
              </div>
              <h2 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.5rem)', fontWeight: 900, color: 'var(--color-text-primary)', marginBottom: 10 }}>
                🏎️ Racing Simulator Passes
              </h2>
              <p style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
                Own the track. Save big. Race more.
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 24,
              alignItems: 'stretch',
            }}>
              {RACING_PASSES.map((pass) => (
                <div
                  key={pass.id}
                  style={{
                    position: 'relative',
                    background: 'var(--color-bg-card)',
                    border: `1px solid ${pass.featured ? pass.borderColor : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-xl)',
                    padding: '36px 28px 32px',
                    boxShadow: pass.featured ? `0 0 40px ${pass.glowColor}` : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: pass.bgColor,
                    borderRadius: 'inherit',
                    pointerEvents: 'none',
                  }} />

                  <div style={{
                    position: 'absolute', top: 20, right: 20,
                    padding: '4px 12px', borderRadius: '999px',
                    background: pass.bgColor,
                    border: `1px solid ${pass.borderColor}`,
                    fontSize: '0.7rem', fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: pass.color,
                  }}>
                    {pass.badge}
                  </div>

                  <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 12 }}>{pass.icon}</div>

                    <div style={{
                      fontSize: '1.25rem', fontWeight: 800,
                      color: 'var(--color-text-primary)', marginBottom: 6,
                    }}>
                      {pass.name}
                    </div>

                    <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 18 }}>
                      {pass.line}
                    </p>

                    <div style={{ marginBottom: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '2.6rem', fontWeight: 900, color: pass.color, lineHeight: 1 }}>
                          ₹{pass.price.toLocaleString('en-IN')}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>/ 30 days</span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                        {pass.hours} Hours • {pass.discount}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: pass.color, marginTop: 4, fontWeight: 700 }}>
                        Save ₹{pass.savings.toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 12px', borderRadius: '999px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '0.78rem', fontWeight: 600,
                        color: 'var(--color-text-secondary)',
                      }}>
                        <Clock size={12} style={{ color: pass.color }} />
                        {pass.hours} Hours
                      </span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 12px', borderRadius: '999px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '0.78rem', fontWeight: 600,
                        color: 'var(--color-text-secondary)',
                      }}>
                        <Calendar size={12} style={{ color: pass.color }} />
                        30 Days
                      </span>
                    </div>

                    <ul style={{
                      listStyle: 'none', padding: 0, margin: '0 0 28px',
                      display: 'flex', flexDirection: 'column', gap: 10, flex: 1,
                    }}>
                      {[
                        `${pass.hours} hours of simulator racing`,
                        'Valid on weekdays (Mon – Fri)',
                        'Valid for 30 days from purchase',
                        'Built for non-controller simulator sessions',
                        `Normal price ₹${(pass.price + pass.savings).toLocaleString('en-IN')} · Save ₹${pass.savings.toLocaleString('en-IN')}`,
                      ].map((perk) => (
                        <li
                          key={perk}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            fontSize: '0.875rem', color: 'var(--color-text-secondary)',
                          }}
                        >
                          <CheckCircle size={15} style={{ color: pass.color, flexShrink: 0 }} />
                          {perk}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Single purchase note */}
          <div style={{
            marginTop: 32, textAlign: 'center',
            padding: '20px 24px',
            background: 'rgba(255,215,0,0.05)',
            border: '1px solid rgba(255,215,0,0.2)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              🏪 Visit our guild to purchase
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
              Drop by in person during weekday hours and our staff will get you set up with the right pass.
            </p>
          </div>

          {/* Terms note */}
          <div style={{
            marginTop: 36,
            padding: '18px 24px',
            background: 'rgba(255,215,0,0.04)',
            border: '1px solid rgba(255,215,0,0.15)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <Calendar size={18} style={{ color: '#FFD700', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--color-text-secondary)' }}>Terms & Conditions — </strong>
              Passes are valid for <strong>weekdays only (Monday to Friday)</strong>. Weekend sessions are excluded.
              All passes expire <strong>30 days</strong> from the date of purchase. Unused hours are non-refundable.
              Hours can be split across any number of visits with <strong>no daily usage cap</strong>.
              Call us at{' '}
              <a href="tel:+919989562474" style={{ color: '#FFD700', textDecoration: 'none', fontWeight: 600 }}>
                +91 9989562474
              </a>{' '}
              to purchase or for any queries.
            </div>
          </div>

          {/* Back to booking */}
          <div style={{ textAlign: 'center', marginTop: 36 }}>
            <Link
              href="/book"
              className="btn btn-primary btn-lg"
              style={{ display: 'inline-flex' }}
            >
              <Calendar size={18} />
              Book a Single Session
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
