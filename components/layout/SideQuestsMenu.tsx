'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronDown,
  Compass,
  Gift,
  RotateCw,
  Shield,
} from 'lucide-react';

const CLOSE_DELAY_MS = 125;

const SIDE_QUESTS = [
  {
    href: '/armory',
    title: 'Artifacts',
    subtitle: 'Collect gear and complete legendary sets',
    icon: Shield,
    accent: 'side-quest-accent-violet',
  },
  {
    href: '/daily-spin',
    title: 'Guild Spin',
    subtitle: 'Spin daily and claim your reward',
    icon: RotateCw,
    accent: 'side-quest-accent-cyan',
  },
  {
    href: '/draws',
    title: 'Guild Drop',
    subtitle: 'Unlock surprise guild loot',
    icon: Gift,
    accent: 'side-quest-accent-blue',
  },
];

type SideQuestsMenuProps = {
  pathname: string;
};

export function SideQuestsMenu({ pathname }: SideQuestsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLLIElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByClickRef = useRef(false);

  const isActive = SIDE_QUESTS.some(({ href }) => (
    pathname === href || pathname.startsWith(`${href}/`)
  ));

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    setIsOpen(true);
  }, [clearCloseTimer]);

  const closeMenu = useCallback(() => {
    clearCloseTimer();
    openedByClickRef.current = false;
    setIsOpen(false);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      openedByClickRef.current = false;
      setIsOpen(false);
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const toggleMenu = useCallback(() => {
    clearCloseTimer();
    if (openedByClickRef.current) {
      closeMenu();
      return;
    }
    openedByClickRef.current = true;
    setIsOpen(true);
  }, [clearCloseTimer, closeMenu]);

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMenu();
      triggerRef.current?.focus();
    };
    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const handleDesktopChange = (event: MediaQueryListEvent) => {
      if (!event.matches) closeMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    desktopQuery.addEventListener('change', handleDesktopChange);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      desktopQuery.removeEventListener('change', handleDesktopChange);
    };
  }, [isOpen, closeMenu]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  return (
    <li
      ref={rootRef}
      className="side-quests-root"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) scheduleClose();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`navbar-link side-quests-trigger ${isOpen ? 'open' : ''} ${isActive ? 'active' : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls="side-quests-menu"
        onClick={toggleMenu}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleMenu();
          }
        }}
      >
        <Compass size={15} />
        <span>Side Quests</span>
        <ChevronDown className="side-quests-chevron" size={14} />
      </button>

      <div
        id="side-quests-menu"
        className={`side-quests-panel ${isOpen ? 'open' : ''}`}
        aria-hidden={!isOpen}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
      >
        <nav className="container side-quests-panel-inner" aria-label="Side Quests">
          <ul className="side-quests-grid">
            {SIDE_QUESTS.map((quest) => {
              const Icon = quest.icon;
              const questActive = pathname === quest.href || pathname.startsWith(`${quest.href}/`);

              return (
                <li key={quest.href}>
                  <Link
                    href={quest.href}
                    className={`side-quest-card ${quest.accent} ${questActive ? 'active' : ''}`}
                    tabIndex={isOpen ? 0 : -1}
                    onClick={closeMenu}
                  >
                    <span className="side-quest-icon"><Icon size={21} /></span>
                    <span className="side-quest-copy">
                      <strong>{quest.title}</strong>
                      <span>{quest.subtitle}</span>
                    </span>
                    <ArrowRight className="side-quest-arrow" size={16} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </li>
  );
}
