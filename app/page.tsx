import Link from 'next/link';
import HeroActions from '@/components/HeroActions';
import HomeVaultButton from '@/components/HomeVaultButton';
import vaultButtonStyles from '@/components/home-vault-button.module.css';
import HomepageVisitTracker from '@/components/HomepageVisitTracker';
import { StationAvailabilityBoard } from '@/components/StationAvailabilityBoard';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { formatCurrency } from '@/lib/utils';
import { getIndiaClock, getSpecialOpeningNotice } from '@/lib/public-booking-time';
import { loadActiveSpecialOpening } from '@/lib/special-opening-server';
import { getTowerHomePrompt } from '@/lib/tower';
import { resolvePs5RentalAvailability } from '@/lib/ps5-rental';
import {
  Gamepad2,
  Calendar,
  Zap,
  Shield,
  Clock,
  ChevronRight,
  Monitor,
  Wifi,
  Phone,
  MapPin,
  Instagram,
  RotateCcw,
  Castle,
  Target,
  Gift,
  Trophy,
} from 'lucide-react';

const HOME_SIDE_QUESTS = [
  { href: '/guess-36', label: 'Guess 36', icon: Target, tone: 'guess' },
  { href: '/tower', label: 'Tower', icon: Castle, tone: 'tower' },
  { href: '/daily-spin', label: 'Guild Spin', icon: RotateCcw, tone: 'spin' },
  { href: '/armory', label: 'Artifacts', icon: Shield, tone: 'artifacts' },
  { href: '/draws', label: 'Guild Drop', icon: Gift, tone: 'drop' },
  { href: '/tournaments', label: 'Tournament', icon: Trophy, tone: 'tournament' },
] as const;

async function getStations() {
  return prisma.station.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' },
    take: 6,
  });
}

async function getStats() {
  const [totalBookings, totalUsers, totalStations] = await Promise.all([
    prisma.booking.count(),
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.station.count({ where: { isActive: true } }),
  ]);
  return { totalBookings, totalUsers, totalStations };
}

const STATION_ICONS: Record<number, string> = {
  1: '🖥️', 2: '💻', 3: '🎮', 4: '🕹️', 5: '⚡',
  6: '🥽', 7: '📡', 8: '🎯', 9: '🏎️', 10: '✈️',
};

const FEATURES = [
  {
    icon: Zap,
    title: 'Ultra-Fast Console',
    description: 'AMD Zen 2, 8-core CPU, RDNA 2 GPU (10.3 TFLOPS), 16GB GDDR6 RAM, high-speed SSD — built for peak performance.',
    color: 'rgba(108, 99, 255, 0.12)',
    iconColor: '#6c63ff',
  },
  {
    icon: Monitor,
    title: '4K & 144Hz Displays',
    description: 'Crystal-clear visuals with ultra-smooth refresh rates on every station.',
    color: 'rgba(0, 212, 255, 0.08)',
    iconColor: '#00d4ff',
  },
  {
    icon: Gamepad2,
    title: 'DualSense Sony Controllers',
    description: 'Experience next-gen haptic feedback and adaptive triggers with Sony DualSense controllers on every PS5 setup.',
    color: 'rgba(255, 45, 85, 0.08)',
    iconColor: '#ff2d55',
  },
  {
    icon: Wifi,
    title: 'High-Speed Internet',
    description: '1Gbps fiber connection with dedicated bandwidth per station.',
    color: 'rgba(0, 230, 118, 0.08)',
    iconColor: '#00e676',
  },
  {
    icon: Calendar,
    title: 'Easy Online Booking',
    description: 'Reserve your slot in seconds. Instant confirmation, no waiting.',
    color: 'rgba(255, 170, 0, 0.08)',
    iconColor: '#ffaa00',
  },
  {
    icon: Shield,
    title: 'Safe & Secure',
    description: 'Clean, sanitized stations with secure accounts and protected payments.',
    color: 'rgba(108, 99, 255, 0.08)',
    iconColor: '#6c63ff',
  },
];

export default async function HomePage() {
  const now = new Date();
  const sessionPromise = auth();
  const towerPromptPromise = sessionPromise.then((currentSession) => (
    currentSession?.user?.id ? getTowerHomePrompt(currentSession.user.id, now) : null
  )).catch((error) => {
    console.error('Tower homepage prompt failed:', error);
    return null;
  });
  const [stations, stats, session, specialOpening, homeSettings, towerPrompt] = await Promise.all([
    getStations(),
    getStats(),
    sessionPromise,
    loadActiveSpecialOpening(now),
    prisma.setting.findMany({ where: { key: { in: ['show_stations_availability', 'ps5_rental_status', 'ps5_rental_enabled'] } } }),
    towerPromptPromise,
  ]);
  const homeSettingsMap = Object.fromEntries(homeSettings.map((setting) => [setting.key, setting.value]));
  const showStationsAvailability = homeSettingsMap.show_stations_availability !== 'false';
  const ps5RentalStatus = resolvePs5RentalAvailability(homeSettingsMap);
  const indiaClock = getIndiaClock(now);
  const specialOpeningNotice = getSpecialOpeningNotice(
    specialOpening,
    indiaClock.minutes,
  );
  const towerPromptTitle = towerPrompt?.kind === 'ATTEMPT' ? 'Continue Your Tower' : 'Tower Token Ready';

  return (
    <>
      <HomepageVisitTracker />

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />

        <div className="container">
          <div className="hero-content animate-fade-in-up" style={{ maxWidth: 680 }}>
            <div className={`hero-eyebrow-row ${vaultButtonStyles.header}${towerPrompt ? ' has-tower-banner' : ''}`}>
              <div className="hero-eyebrow">
                <Zap size={14} />
                Premium Gaming Experience
              </div>


              <div className={vaultButtonStyles.mobileBell}>
                <HomeVaultButton />
              </div>
              {specialOpeningNotice && (
                <div className={`hero-opening-pill ${specialOpeningNotice.state}`}>
                  <Clock size={14} />
                  <span className="hero-opening-pill-copy">
                    <strong>{specialOpeningNotice.title}</strong>
                    <span>{specialOpeningNotice.detail}</span>
                  </span>
                </div>
              )}
            </div>

            {towerPrompt && (
              <Link href="/tower" className="tower-home-banner">
                <span className="tower-home-banner-visual" aria-hidden="true">
                  <Castle size={22} />
                </span>
                <span className="tower-home-banner-copy">
                  <strong>{towerPromptTitle}</strong>
                  <span>How high can you climb?</span>
                </span>
                <span className="tower-home-banner-action">
                  Climb Now <ChevronRight size={17} />
                </span>
              </Link>
            )}

            <h1 className="hero-title">
              Level Up Your
              <br />
              <span className="hero-title-gradient">Gaming Sessions</span>
            </h1>

            <p className="hero-subtitle">
              Book your Play Station online in seconds and step in ready for action.
            </p>

            <HeroActions ps5RentalStatus={ps5RentalStatus} />

            <nav className="home-side-quests" aria-label="Side Quests shortcuts">
              <span className="home-side-quests-label">Side Quests</span>
              <div className="home-side-quests-grid">
                {HOME_SIDE_QUESTS.map(({ href, label, icon: Icon, tone }) => (
                  <Link key={href} href={href} className={`home-side-quest ${tone}`}>
                    <span className="home-side-quest-icon" aria-hidden="true">
                      <Icon size={17} />
                    </span>
                    <span>{label}</span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </nav>

            <div className="hero-stats">
              <div>
                <div className="hero-stat-value">{stats.totalStations}+</div>
                <div className="hero-stat-label">Gaming Stations</div>
              </div>
              <div>
                <div className="hero-stat-value">{stats.totalUsers}+</div>
                <div className="hero-stat-label">Active Gamers</div>
              </div>
              {/* <div>
                <div className="hero-stat-value">{stats.totalBookings}+</div>
                <div className="hero-stat-label">Sessions Booked</div>
              </div> */}
            </div>
          </div>
        </div>
      </section>

      {showStationsAvailability && <StationAvailabilityBoard mode="public" />}

      {/* ── FEATURES ─────────────────────────────────────── */}
      <section className="section" style={{ background: 'var(--color-bg-surface)' }}>
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Why Choose Us</div>
            <h2 className="section-title">
              Everything You Need to{' '}
              <span className="text-gradient">Game Like a Pro</span>
            </h2>
            <p className="section-description">
              State-of-the-art equipment, blazing-fast internet, and a premium atmosphere.
              Your ultimate gaming destination.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 'var(--space-lg)',
            }}
          >
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="card card-hover animate-fade-in-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div
                  className="stat-icon"
                  style={{
                    background: f.color,
                    marginBottom: 'var(--space-md)',
                    color: f.iconColor,
                  }}
                >
                  <f.icon size={22} />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATIONS ─────────────────────────────────────── */}
      <section className="section" id="stations">
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Our Stations</div>
            <h2 className="section-title">
              Choose Your{' '}
              <span className="text-gradient">Battle Station</span>
            </h2>
            <p className="section-description">
              From casual gaming rigs to professional simulators — we&apos;ve got the perfect
              station for every gamer.
            </p>
          </div>

          <div className="stations-grid">
            {stations.map((station, i) => (
              <div
                key={station.id}
                className="station-card animate-fade-in-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="station-image">
                  {STATION_ICONS[station.position] || '🖥️'}
                </div>
                <div className="station-body">
                  <div className="station-name">{station.name}</div>
                  <div className="station-description">{station.description}</div>
                  <div className="station-specs">{station.specs}</div>
                  <div className="station-footer">
                    <div>
                      <div className="station-price">
                        {formatCurrency(station.hourlyRate)}
                      </div>
                      <div className="station-price-label">per hour</div>
                    </div>
                    <Link href={`/book?station=${station.id}`} className="btn btn-primary btn-sm">
                      Book Now
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 'var(--space-2xl)' }}>
            <Link href="/book" className="btn btn-secondary">
              View All Stations & Book
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="section">
        <div className="container">
          <div
            className="card"
            style={{
              textAlign: 'center',
              padding: 'var(--space-3xl)',
              background:
                'linear-gradient(135deg, rgba(108,99,255,0.15) 0%, rgba(0,212,255,0.08) 100%)',
              border: '1px solid rgba(108, 99, 255, 0.3)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '-100px',
                right: '-100px',
                width: '400px',
                height: '400px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(108,99,255,0.15), transparent 70%)',
                pointerEvents: 'none',
              }}
            />
            <Gamepad2
              size={56}
              style={{ color: 'var(--color-accent-primary)', marginBottom: 'var(--space-lg)' }}
            />
            <h2 className="section-title" style={{ marginBottom: 'var(--space-md)' }}>
              Ready to <span className="text-gradient">Game?</span>
            </h2>
            <p
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: '1rem',
                maxWidth: '500px',
                margin: '0 auto var(--space-xl)',
              }}
            >
              Book your station right now and get gaming within minutes. No waiting in
              queues. Instant slot reservation.
            </p>
            <div className="flex justify-center gap-md flex-wrap">
              {session ? (
                <Link href="/book" className="btn btn-primary btn-lg" id="cta-book-btn">
                  <Calendar size={18} />
                  Book a Slot Now
                </Link>
              ) : (
                <Link href="/register" className="btn btn-primary btn-lg" id="cta-register-btn">
                  <UserPlus size={18} />
                  Create Account
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <Link href="/" className="navbar-logo" style={{ display: 'inline-flex', marginBottom: 'var(--space-md)' }}>
                <Gamepad2 size={22} />
                EmiGuild
              </Link>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
                Your ultimate gaming destination. Premium setups, unbeatable experience.
              </p>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 'var(--space-md)', fontSize: '0.9rem' }}>Quick Links</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  ['/book', 'Book a Slot'],
                  ['/games', 'Games'],
                  ['/passes', 'Passes'],
                  ['/tournaments', 'Tournaments'],
                  ['/daily-spin', 'Guild Spin'],
                  ...(session ? [['/my-bookings', 'My Bookings']] : []),
                ].map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>  
            <div>
              <div style={{ fontWeight: 700, marginBottom: 'var(--space-md)', fontSize: '0.9rem' }}>Hours</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                <span>Mon–Fri: 04 PM – 11 PM</span>
                <span>Sat–Sun: 11 AM – 11 PM</span>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 'var(--space-md)', fontSize: '0.9rem' }}>Contact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <a
                  href="tel:+919989562474"
                  className="footer-map-link"
                  style={{ fontWeight: 600 }}
                >
                  <Phone size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                  +91 9989562474
                </a>
                <a
                  href="https://maps.app.goo.gl/BguSp1D4LwCuX2PD9"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-map-link"
                >
                  <MapPin size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                  Find us on Google Maps
                </a>
                <a
                  href="https://www.instagram.com/theemiguild"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-map-link"
                >
                  <Instagram size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                  Instagram
                </a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-copyright">
              © {new Date().getFullYear()} EmiGuild. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

function UserPlus({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <line x1="19" y1="8" x2="19" y2="14"/>
      <line x1="22" y1="11" x2="16" y2="11"/>
    </svg>
  );
}
