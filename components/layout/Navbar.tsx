'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Calendar, BookOpen, User, LogOut,
  LayoutDashboard, LogIn, UserPlus, Menu, X, Award, RotateCw, Gift, Home, Trophy
} from 'lucide-react';
import ThemeToggle from '../ThemeToggle';

export function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brandColorIndex, setBrandColorIndex] = useState(0);
  const navRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (navRef.current) {
      const activeElements = navRef.current.querySelectorAll('.active');
      // Target the active element in the true middle set (index 2 out of 5)
      const activeElement = (activeElements.length >= 5 ? activeElements[2] : activeElements[0]) as HTMLElement;
      if (activeElement) {
        const container = navRef.current;
        const targetScrollLeft = activeElement.offsetLeft - (container.clientWidth / 2) + (activeElement.clientWidth / 2);
        // Use instant scroll (auto) on load to prevent conflicting with the infinite scroll boundary logic
        container.scrollTo({ left: targetScrollLeft, behavior: 'auto' });
      }
    }
  }, [pathname]);

  // Map vertical wheel scroll to horizontal scroll
  // Map vertical wheel scroll to horizontal scroll + Infinite scroll logic
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        nav.scrollLeft += e.deltaY;
      }
    };

    const handleScroll = () => {
      // The container has 5 identical sets of links.
      const setWidth = nav.scrollWidth / 5;

      // Keep scroll position safely around the middle set (setWidth * 2)
      // This ensures we never hit a physical wall, regardless of container width.
      if (nav.scrollLeft <= setWidth * 1.5) {
        nav.scrollLeft += setWidth;
      } else if (nav.scrollLeft >= setWidth * 2.5) {
        nav.scrollLeft -= setWidth;
      }
    };

    nav.addEventListener('wheel', handleWheel, { passive: false });
    nav.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      nav.removeEventListener('wheel', handleWheel);
      nav.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const isActive = (path: string) =>
    path === '/'
      ? pathname === '/'
      : pathname === path || pathname.startsWith(path + '/');

  const navLinks = [
    { href: '/', label: 'Home', icon: <Home size={15} /> },
    { href: '/tournaments', label: 'Tournaments', icon: <Trophy size={15} /> },
    { href: '/book', label: 'Book a Slot', icon: <Calendar size={15} /> },
    { href: '/passes', label: 'Passes', icon: <Award size={15} /> },
    { href: '/daily-spin', label: 'Guild Spin', icon: <RotateCw size={15} /> },
    { href: '/draws', label: '🎁 Guild Drop', icon: null },
    ...(session ? [{ href: '/my-bookings', label: 'My Bookings', icon: <BookOpen size={15} /> }] : []),
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: <LayoutDashboard size={15} /> }] : []),
  ];

  const closeMobile = () => setMobileOpen(false);

  const handleBrandClick = () => {
    setBrandColorIndex((prev) => (prev + 1) % 4);
  };

  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          {/* Left Group: Logo + Desktop Brand */}
          <div className="navbar-left">
            {/* Logo */}
            <Link href="/" className="navbar-logo" onClick={closeMobile}>
              <Image src="/images/logoImage.png" alt="GameZone" height={36} width={36} style={{ objectFit: 'contain', flexShrink: 0, minWidth: 36 }} />
            </Link>

            {/* Desktop accent brand text */}
            <div
              className="navbar-brand-text navbar-desktop-brand"
              data-color-index={brandColorIndex}
              onClick={handleBrandClick}
              aria-hidden="true"
            >
              EMIGUILD
            </div>
          </div>

          {/* Desktop nav links (Rendered 5x for infinite scroll runway) */}
          <ul className="navbar-nav" ref={navRef}>
            {[...navLinks, ...navLinks, ...navLinks, ...navLinks, ...navLinks].map((link, index) => (
              <li key={`${link.href}-${index}`}>
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
            <ThemeToggle />
          </div>

          {/* Mobile accent brand text */}
          <div
            className="navbar-brand-text navbar-mobile-brand"
            data-color-index={brandColorIndex}
            onClick={handleBrandClick}
            aria-hidden="true"
          >
            EMIGUILD
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

      {/* Mobile Floating Theme Toggle (escaped from navbar-inner clipping) */}
      <div className="mobile-floating-toggle">
        <ThemeToggle />
      </div>


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
