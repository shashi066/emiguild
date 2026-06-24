'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, BookOpen, Monitor, Users,
  Gamepad2, ChevronRight, UserPlus, Settings, Award, Gift,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/admin',          label: 'Dashboard',      icon: LayoutDashboard, exact: true },
  { href: '/admin/bookings', label: 'All Bookings',   icon: BookOpen },
  { href: '/admin/walkin',   label: 'Walk-in Booking', icon: UserPlus },
  { href: '/admin/passes',   label: 'Passes',         icon: Award },
  { href: '/admin/draws',    label: 'Lucky Draw',     icon: Gift },
  { href: '/admin/stations', label: 'Stations',       icon: Monitor },
  { href: '/admin/daily-spin',label: 'Daily Spin',    icon: Gift },
  { href: '/admin/users',    label: 'Users',          icon: Users },
  { href: '/admin/settings', label: 'Settings',       icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <aside className="admin-sidebar">
      {/* Branding */}
      <div
        style={{
          padding: '0 var(--space-lg) var(--space-xl)',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: 'var(--space-lg)',
        }}
      >
        <Link
          href="/"
          className="navbar-logo"
          style={{ fontSize: '1rem', textDecoration: 'none' }}
        >
          <Gamepad2 size={20} />
          GameZone
        </Link>
        <div
          style={{
            marginTop: 6,
            fontSize: '0.7rem',
            fontWeight: 700,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Admin Console
        </div>
      </div>

      {/* Nav */}
      <div className="admin-sidebar-title">Navigation</div>
      <nav>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-item ${active ? 'active' : ''}`}
              id={`admin-nav-${item.label.toLowerCase().replace(' ', '-')}`}
            >
              <Icon size={18} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {active && <ChevronRight size={14} />}
            </Link>
          );
        })}
      </nav>

      {/* Footer link */}
      <div
        style={{
          padding: 'var(--space-lg)',
          borderTop: '1px solid var(--color-border)',
          marginTop: 'var(--space-2xl)',
        }}
      >
        <Link
          href="/"
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', justifyContent: 'flex-start' }}
        >
          ← Back to Site
        </Link>
      </div>
    </aside>
  );
}
