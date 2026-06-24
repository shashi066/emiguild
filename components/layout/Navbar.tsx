'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Calendar, BookOpen, User, LogOut,
  LayoutDashboard, LogIn, UserPlus, Menu, X, Award, Gift
} from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) =>
    path === '/'
      ? pathname === '/'
      : pathname === path || pathname.startsWith(path + '/');

  const navLinks = [
    { href: '/',           label: 'Home',        icon: null },
    { href: '/book',       label: 'Book a Slot', icon: <Calendar size={15} /> },
    { href: '/passes',     label: 'Passes',      icon: <Award size={15} /> },
    { href: '/daily-spin', label: 'Lucky Spin',    icon: <Gift size={15} /> },
    { href: '/draws',      label: '🎁 Guild Drop',  icon: null },
    ...(session ? [{ href: '/my-bookings', label: 'My Bookings', icon: <BookOpen size={15} /> }] : []),
    ...(isAdmin  ? [{ href: '/admin',      label: 'Admin',       icon: <LayoutDashboard size={15} /> }] : []),
  ];

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          {/* Logo */}
          <Link href="/" className="navbar-logo" onClick={closeMobile}>
            <Image src="/images/logoImage.png" alt="GameZone" height={60} width={60} style={{ objectFit: 'contain' }} />
          </Link>

          {/* Desktop nav links */}
          <ul className="navbar-nav">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`navbar-link ${isActive(link.href) ? 'active' : ''}`}
                >
                  {link.icon}
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop auth */}
          <div className="navbar-actions">
            {session ? (
              <>
                <Link href="/profile" className="btn btn-ghost btn-sm" id="navbar-profile-btn">
                  <User size={15} />
                  {session.user?.name?.split(' ')[0]}
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="btn btn-secondary btn-sm"
                  id="navbar-logout-btn"
                >
                  <LogOut size={15} />
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost btn-sm">
                  <LogIn size={15} />
                  Login
                </Link>
                <Link href="/register" className="btn btn-primary btn-sm">
                  <UserPlus size={15} />
                  Sign Up
                </Link>
              </>
            )}
          </div>

          {/* Hamburger button (mobile only) */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            id="mobile-menu-toggle"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="mobile-drawer" onClick={closeMobile}>
          <div className="mobile-drawer-inner" onClick={(e) => e.stopPropagation()}>
            {/* Nav links */}
            <div className="mobile-nav-links">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`mobile-nav-link ${isActive(link.href) ? 'active' : ''}`}
                  onClick={closeMobile}
                >
                  {link.icon}
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="mobile-nav-divider" />

            {/* Auth actions */}
            <div className="mobile-nav-auth">
              {session ? (
                <>
                  <Link
                    href="/profile"
                    className="btn btn-ghost"
                    style={{ justifyContent: 'flex-start' }}
                    onClick={closeMobile}
                  >
                    <User size={16} />
                    {session.user?.name}
                  </Link>
                  <button
                    onClick={() => { signOut({ callbackUrl: '/' }); closeMobile(); }}
                    className="btn btn-secondary"
                    style={{ justifyContent: 'flex-start' }}
                  >
                    <LogOut size={16} />
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn btn-ghost" onClick={closeMobile}
                    style={{ justifyContent: 'flex-start' }}>
                    <LogIn size={16} />
                    Login
                  </Link>
                  <Link href="/register" className="btn btn-primary" onClick={closeMobile}
                    style={{ justifyContent: 'flex-start' }}>
                    <UserPlus size={16} />
                    Create Account
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
