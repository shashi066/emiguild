'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, BookOpen, Monitor, Users,
  Gamepad2, ChevronRight, ChevronDown, UserPlus, Settings, Award, Gift, RotateCw, Trophy, Shield, Activity, Tv, Menu, X, Castle, CupSoda, Target, ShoppingBag, Search,
} from 'lucide-react';

const NAV_GROUPS = [
  { label: 'Overview', items: [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: '/admin/analytics', label: 'Analytics', icon: Activity },
  ] },
  { label: 'Daily Operations', items: [
    { href: '/admin/bookings', label: 'All Bookings', icon: BookOpen },
    { href: '/admin/walkin', label: 'Walk-in Booking', icon: UserPlus },
    { href: '/admin/ps5-rentals', label: 'PS5 Rentals', icon: Gamepad2 },
    { href: '/admin/fnb', label: 'F&B Items', icon: CupSoda },
  ] },
  { label: 'Venue', items: [
    { href: '/admin/stations', label: 'Stations', icon: Monitor },
    { href: '/admin/games', label: 'Games', icon: Gamepad2 },
  ] },
  { label: 'Customers', items: [
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/passes', label: 'Passes', icon: Award },
    { href: '/admin/lifecycle', label: 'Messaging', icon: Gift },
  ] },
  { label: 'Activities & Rewards', items: [
    { href: '/admin/armory', label: 'Artifacts', icon: Shield },
    { href: '/admin/tower', label: 'Tower', icon: Castle },
    { href: '/admin/guess-36', label: 'Guess 36', icon: Target },
    { href: '/admin/draws', label: 'Guild Drop', icon: Gift },
    { href: '/admin/daily-spin', label: 'Guild Spin', icon: RotateCw },
    { href: '/admin/tournaments', label: 'Tournaments', icon: Trophy },
    { href: '/admin/watch-parties', label: 'Watch Parties', icon: Tv },
    { href: '/admin/rewards', label: 'EMIC Rewards', icon: ShoppingBag },
  ] },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
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
  const normalizedQuery = query.trim().toLowerCase();

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
            EmiGuild
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
        <div className="admin-nav-search">
          <Search size={15} aria-hidden="true" />
          <input aria-label="Search admin menu" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find admin page…" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear menu search"><X size={14} /></button>}
        </div>
        <nav aria-label="Admin navigation" className="admin-nav-groups">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => !normalizedQuery || item.label.toLowerCase().includes(normalizedQuery) || group.label.toLowerCase().includes(normalizedQuery));
            if (!items.length) return null;
            const containsActive = group.items.some((item) => isActive(item.href, 'exact' in item ? item.exact : undefined));
            const isCollapsed = !normalizedQuery && collapsed[group.label] && !containsActive;
            return <section className="admin-nav-group" key={group.label}>
              <button type="button" className="admin-nav-group-toggle" aria-expanded={!isCollapsed} onClick={() => setCollapsed((current) => ({ ...current, [group.label]: !current[group.label] }))}>
                <span>{group.label}</span><ChevronDown size={14} />
              </button>
              {!isCollapsed && <div className="admin-nav-group-items">{items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, 'exact' in item ? item.exact : undefined);
                return <Link key={item.href} href={item.href} className={`admin-nav-item ${active ? 'active' : ''}`} id={`admin-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`} aria-current={active ? 'page' : undefined} onClick={() => setMobileMenuOpen(false)}>
                  <Icon size={17} /><span style={{ flex: 1 }}>{item.label}</span>{active && <ChevronRight size={14} />}
                </Link>;
              })}</div>}
            </section>;
          })}
          {!NAV_GROUPS.some((group) => group.items.some((item) => !normalizedQuery || item.label.toLowerCase().includes(normalizedQuery) || group.label.toLowerCase().includes(normalizedQuery))) && <p className="admin-nav-empty">No admin pages found.</p>}
        </nav>

        {/* Footer link */}
        <div className="admin-sidebar-footer">
          <Link href="/admin/settings" className={`admin-nav-item admin-settings-link ${pathname.startsWith('/admin/settings') ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}><Settings size={17} /><span>Settings</span></Link>
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
