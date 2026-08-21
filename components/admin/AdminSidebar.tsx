'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, BookOpen, Monitor, Users,
  Gamepad2, ChevronRight, UserPlus, Settings, Award, Gift, RotateCw, Trophy, Shield, Activity, Tv, Menu, X, CupSoda,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/admin',          label: 'Dashboard',      icon: LayoutDashboard, exact: true },
  { href: '/admin/bookings', label: 'All Bookings',   icon: BookOpen },
  { href: '/admin/walkin',   label: 'Walk-in Booking', icon: UserPlus },
  { href: '/admin/passes',   label: 'Passes',         icon: Award },
  { href: '/admin/armory',    label: 'Artifacts',      icon: Shield },
  { href: '/admin/draws',    label: 'Guild Drop',     icon: Gift },
  { href: '/admin/stations', label: 'Stations',       icon: Monitor },
  { href: '/admin/games',    label: 'Games',          icon: Gamepad2 },
  { href: '/admin/daily-spin', label: 'Guild Spin', icon: RotateCw },
  { href: '/admin/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/admin/watch-parties', label: 'Watch Parties', icon: Tv },
  { href: '/admin/fnb',          label: 'F&B Inventory',  icon: CupSoda },
  { href: '/admin/users',    label: 'Users',          icon: Users },
  { href: '/admin/settings', label: 'Settings',       icon: Settings },
  { href: '/admin/analytics', label: 'Analytics',     icon: Activity },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMobileMenuOpen(false);
      window.requestAnimationFrame(() => mobileMenuToggleRef.current?.focus());
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <aside className={`admin-sidebar ${mobileMenuOpen ? 'admin-sidebar--open' : ''}`}>
      <div className="admin-sidebar-mobile-head">
        {/* Branding */}
        <div className="admin-sidebar-branding">
          <Link
            href="/"
            className="navbar-logo"
            style={{ fontSize: '1rem', textDecoration: 'none' }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Gamepad2 size={20} />
            GameZone
          </Link>
          <div className="admin-sidebar-console-label">
            Admin Console
          </div>
        </div>

        <button
          ref={mobileMenuToggleRef}
          className="admin-sidebar-mobile-toggle"
          type="button"
          aria-expanded={mobileMenuOpen}
          aria-controls="admin-navigation-panel"
          aria-label={mobileMenuOpen ? 'Close admin menu' : 'Open admin menu'}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          <span>Admin Menu</span>
        </button>
      </div>

      <div id="admin-navigation-panel" className="admin-sidebar-panel">
        {/* Nav */}
        <div className="admin-sidebar-title">Navigation</div>
        <nav aria-label="Admin navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-item ${active ? 'active' : ''}`}
                id={`admin-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Icon size={18} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {active && <ChevronRight size={14} />}
              </Link>
            );
          })}
        </nav>

        {/* Footer link */}
        <div className="admin-sidebar-footer">
          <Link
            href="/"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => setMobileMenuOpen(false)}
          >
            ← Back to Site
          </Link>
        </div>
      </div>
    </aside>
  );
}
