import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Award, Clock, Calendar, CheckCircle,
  Star, Zap, ArrowRight, ArrowLeft, Crown, Sword,
} from 'lucide-react';
import {
  GuildMembershipPlan,
  getGuildMembershipPlan,
} from '@/lib/guild-membership';
import { loadGuildMembershipPlans } from '@/lib/guild-membership-server';

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

const GUILD_COMPARISON = [
  { feature: 'Solo PS5 bookings', hero: '50% OFF', master: '50% OFF' },
  { feature: 'Solo member rate', hero: '₹75/hour', master: '₹75/hour' },
  { feature: 'Squad PS5 bookings', hero: 'Not included', master: '50% OFF' },
  { feature: 'Valid days', hero: 'Every day', master: 'Every day' },
  { feature: 'Racing Simulator', hero: 'Not included', master: 'Not included' },
  { feature: 'Account holder presence', hero: 'Required', master: 'Required' },
  { feature: 'Best for', hero: 'Regular solo players', master: 'Players who bring friends' },
];

function GuildMembershipSection({ plans }: { plans: GuildMembershipPlan[] }) {
  const heroPlan = getGuildMembershipPlan(plans, 'GUILD_HERO');
  const masterPlan = getGuildMembershipPlan(plans, 'GUILD_MASTER');
  const comparisonRows = [
    {
      feature: 'Membership price',
      hero: `₹${heroPlan.price.toLocaleString('en-IN')} / ${heroPlan.validityDays} days`,
      master: `₹${masterPlan.price.toLocaleString('en-IN')} / ${masterPlan.validityDays} days`,
    },
    ...GUILD_COMPARISON,
  ];

  return (
    <section className="guild-memberships" aria-labelledby="guild-memberships-title">
      <style>{`
        .guild-memberships { margin-top: 64px; }
        .guild-membership-heading { max-width: 660px; margin: 0 auto 28px; text-align: center; }
        .guild-membership-heading h2 { margin: 0 0 8px; font-size: clamp(1.7rem, 4vw, 2.4rem); color: var(--color-text-primary); }
        .guild-membership-heading strong { display: block; color: #f4cf58; font-size: 1rem; margin-bottom: 8px; }
        .guild-membership-heading p { margin: 0; color: var(--color-text-secondary); line-height: 1.65; }
        .guild-membership-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
        .guild-membership-card { position: relative; min-width: 0; display: flex; flex-direction: column; padding: 24px; border-radius: var(--radius-md); overflow: hidden; }
        .guild-membership-card.guild-hero { border: 1px solid rgba(96,165,250,0.45); background: rgba(15,31,52,0.96); }
        .guild-membership-card.guild-master { border: 1px solid rgba(244,207,88,0.5); background: rgba(43,30,48,0.96); }
        .guild-membership-topline { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 16px; }
        .guild-membership-rank { display: inline-flex; align-items: center; gap: 8px; font-size: 1.15rem; font-weight: 850; }
        .guild-membership-card.guild-hero .guild-membership-rank { color: #93c5fd; }
        .guild-membership-card.guild-master .guild-membership-rank { color: #f4cf58; }
        .guild-membership-badge { padding: 4px 8px; border: 1px solid currentColor; border-radius: 4px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; color: #f4cf58; }
        .guild-membership-price { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
        .guild-membership-price b { font-size: 2.15rem; line-height: 1; color: var(--color-text-primary); }
        .guild-membership-price span { color: var(--color-text-muted); font-size: 0.82rem; }
        .guild-membership-tagline { margin: 0 0 16px; color: var(--color-text-secondary); font-weight: 700; }
        .guild-membership-rate { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 54px; margin-bottom: 18px; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: rgba(0,0,0,0.14); }
        .guild-membership-rate span { color: var(--color-text-muted); font-size: 0.76rem; }
        .guild-membership-rate strong { color: #4ade80; font-size: 1.12rem; white-space: nowrap; }
        .guild-membership-list { flex: 1; display: grid; gap: 9px; padding: 0; margin: 0 0 20px; list-style: none; }
        .guild-membership-list li { display: flex; align-items: flex-start; gap: 8px; color: var(--color-text-secondary); font-size: 0.85rem; line-height: 1.45; }
        .guild-membership-list svg { flex: 0 0 auto; margin-top: 2px; color: #4ade80; }
        .guild-membership-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
        .guild-membership-actions .btn { min-height: 44px; justify-content: center; text-align: center; }
        .guild-membership-unavailable { min-height: 44px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: rgba(255,255,255,0.04); color: var(--color-text-muted); font: inherit; font-size: 0.8rem; font-weight: 700; }
        .guild-compare { margin-top: 48px; scroll-margin-top: 88px; }
        .guild-compare-heading { text-align: center; margin-bottom: 20px; }
        .guild-compare-heading h3 { margin: 0 0 6px; font-size: 1.45rem; color: var(--color-text-primary); }
        .guild-compare-heading p { margin: 0; color: var(--color-text-muted); }
        .guild-compare-scroll { max-width: 100%; border-radius: var(--radius-md); }
        .guild-compare-scroll:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 3px; }
        .guild-compare-table { border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
        .guild-compare-row { display: grid; grid-template-columns: minmax(180px, 1.25fr) minmax(0, 1fr) minmax(0, 1fr); }
        .guild-compare-row + .guild-compare-row { border-top: 1px solid var(--color-border); }
        .guild-compare-row > div { min-width: 0; padding: 12px 14px; color: var(--color-text-secondary); font-size: 0.82rem; line-height: 1.45; }
        .guild-compare-row > div + div { border-left: 1px solid var(--color-border); }
        .guild-compare-row.header { background: rgba(255,255,255,0.035); }
        .guild-compare-row.header > div { color: var(--color-text-primary); font-weight: 800; }
        .guild-compare-feature { font-weight: 700; color: var(--color-text-primary) !important; }
        .guild-compare-hero { background: rgba(96,165,250,0.045); color: #bfdbfe !important; }
        .guild-compare-master { background: rgba(244,207,88,0.045); color: #fde68a !important; }
        .guild-compare-row > .guild-compare-hero { border-left-color: rgba(96,165,250,0.18); }
        .guild-compare-row > .guild-compare-master { border-left-color: rgba(244,207,88,0.18); }
        .guild-compare-value[data-tone="benefit"] { color: #4ade80; font-weight: 750; }
        .guild-compare-value[data-tone="muted"] { color: var(--color-text-muted); }
        @media (max-width: 768px) {
          .guild-memberships { margin-top: 48px; }
          .guild-membership-grid { grid-template-columns: 1fr; }
          .guild-membership-card { padding: 20px 16px; }
          .guild-compare-scroll {
            overflow-x: auto;
            overscroll-behavior-inline: contain;
            padding-bottom: 7px;
            scrollbar-width: thin;
            scrollbar-color: rgba(147,197,253,0.55) transparent;
            -webkit-overflow-scrolling: touch;
          }
          .guild-compare-scroll::-webkit-scrollbar { height: 6px; }
          .guild-compare-scroll::-webkit-scrollbar-track { background: transparent; }
          .guild-compare-scroll::-webkit-scrollbar-thumb { border-radius: 3px; background: rgba(147,197,253,0.55); }
          .guild-compare-table { width: 535px; min-width: 535px; overflow: visible; }
          .guild-compare-row { grid-template-columns: 145px 175px 215px; }
          .guild-compare-row > div { padding: 11px 10px; overflow-wrap: anywhere; }
          .guild-compare-row.header { background: var(--color-bg-card); }
          .guild-compare-row > .guild-compare-feature,
          .guild-compare-row.header > div:first-child {
            position: sticky;
            left: 0;
            z-index: 2;
            background: var(--color-bg-surface);
            box-shadow: 1px 0 0 var(--color-border);
          }
          .guild-compare-row.header > div:first-child {
            z-index: 3;
            background: var(--color-bg-card);
          }
        }
        @media (max-width: 392px) {
          .guild-compare-table {
            width: calc(145px + min(175px, calc(100vw - 177px)) + min(215px, calc(100vw - 177px)));
            min-width: 0;
          }
          .guild-compare-row {
            grid-template-columns:
              145px
              min(175px, calc(100vw - 177px))
              min(215px, calc(100vw - 177px));
          }
        }
        @media (max-width: 380px) {
          .guild-membership-actions { grid-template-columns: 1fr; }
          .guild-membership-rate { align-items: flex-start; flex-direction: column; }
        }
      `}</style>

      <div className="guild-membership-heading">
        <h2 id="guild-memberships-title">Guild Memberships</h2>
        <strong>Play more. Pay half. Rule the Guild.</strong>
        <p>Join for 30 days and unlock 50% OFF eligible PS5 bookings every day.</p>
      </div>

      <div className="guild-membership-grid">
        {plans.map((plan) => {
          const master = plan.type === 'GUILD_MASTER';
          return (
            <article key={plan.type} className={`guild-membership-card ${master ? 'guild-master' : 'guild-hero'}`}>
              <div className="guild-membership-topline">
                <div className="guild-membership-rank">
                  {master ? <Crown size={21} aria-hidden="true" /> : <Sword size={21} aria-hidden="true" />}
                  {plan.name}
                </div>
                <span className="guild-membership-badge">
                  {master ? 'Most Popular' : '50% OFF'}
                </span>
              </div>
              <div className="guild-membership-price">
                <b>₹{plan.price.toLocaleString('en-IN')}</b>
                <span>/ {plan.validityDays} days</span>
              </div>
              <p className="guild-membership-tagline">{plan.tagline}</p>
              <div className="guild-membership-rate">
                <span>{plan.audience}</span>
                <strong>₹75/hour solo</strong>
              </div>
              <ul className="guild-membership-list">
                <li><CheckCircle size={15} />{plan.description}</li>
                <li><Calendar size={15} />Valid every day</li>
                <li><CheckCircle size={15} />Racing simulators excluded</li>
                <li><CheckCircle size={15} />Verified and manually applied by GameZone</li>
              </ul>
              <div className="guild-membership-actions">
                <a href="#compare-guild-ranks" className="btn btn-ghost">View Benefits</a>
                {plan.isActive ? (
                  <a
                    href="tel:+919989562474"
                    className="btn btn-primary"
                    aria-label={`Call GameZone to join ${plan.name}`}
                  >
                    {master ? 'Join Guild Master' : 'Join Guild Hero'}
                  </a>
                ) : (
                  <button className="guild-membership-unavailable" disabled>Currently Unavailable</button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="guild-compare" id="compare-guild-ranks">
        <div className="guild-compare-heading">
          <h3 id="guild-compare-title">Compare Guild Ranks</h3>
          <p>Choose the membership that matches how you play.</p>
        </div>
        <div
          className="guild-compare-scroll"
          role="region"
          aria-labelledby="guild-compare-title"
          tabIndex={0}
        >
          <div className="guild-compare-table" role="table" aria-label="Guild Membership comparison">
            <div className="guild-compare-row header" role="row">
              <div role="columnheader">Feature</div>
              <div role="columnheader" className="guild-compare-hero">Guild Hero</div>
              <div role="columnheader" className="guild-compare-master">Guild Master · Most Popular</div>
            </div>
            {comparisonRows.map((row) => (
              <div className="guild-compare-row" role="row" key={row.feature}>
                <div className="guild-compare-feature" role="rowheader">{row.feature}</div>
                <div role="cell" className="guild-compare-hero">
                  <span
                    className="guild-compare-value"
                    data-tone={row.hero === 'Not included'
                      ? 'muted'
                      : ['50% OFF', 'Every day'].includes(row.hero) ? 'benefit' : undefined}
                  >
                    {row.hero}
                  </span>
                </div>
                <div role="cell" className="guild-compare-master">
                  <span
                    className="guild-compare-value"
                    data-tone={row.master === 'Not included'
                      ? 'muted'
                      : ['50% OFF', 'Every day'].includes(row.master) ? 'benefit' : undefined}
                  >
                    {row.master}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </section>
  );
}

export default async function PassesPage() {
  const guildPlans = await loadGuildMembershipPlans();

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
                  display: 'flex',
                  flexDirection: 'column',
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

          <GuildMembershipSection plans={guildPlans} />

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
                    display: 'flex',
                    flexDirection: 'column',
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
              Drop by during opening hours and our staff will get you set up with the right pass or membership.
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
              Gaming hour passes are valid for <strong>weekdays only (Monday to Friday)</strong>. Guild Membership
              discounts are valid <strong>every day</strong> for eligible PS5 bookings. All benefits expire after
              <strong> 30 days</strong>. Unused hours are non-refundable.
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
