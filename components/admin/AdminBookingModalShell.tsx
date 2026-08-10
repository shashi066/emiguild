'use client';

import { ReactNode, useEffect, useRef } from 'react';

type AdminBookingModalShellProps = {
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
};

export function AdminBookingModalShell({
  onClose,
  labelledBy,
  children,
}: AdminBookingModalShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const previouslyFocused = document.activeElement;

    const previousRootOverflow = root.style.overflow;
    const previousRootScrollBehavior = root.style.scrollBehavior;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyLeft = body.style.left;
    const previousBodyWidth = body.style.width;
    const previousBodyScrollBehavior = body.style.scrollBehavior;

    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    // Fixed-body locking is still needed for reliable touch scrolling on mobile.
    // Desktop can avoid the extra full-page repaint and only lock overflow.
    if (isMobile) {
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = `-${scrollX}px`;
      body.style.width = '100%';
    }

    dialogRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      root.style.scrollBehavior = 'auto';
      body.style.scrollBehavior = 'auto';
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.left = previousBodyLeft;
      body.style.width = previousBodyWidth;

      // Force the fixed-body styles to clear before restoring the viewport. The
      // temporary `auto` overrides the app-wide smooth scrolling rule.
      void body.offsetHeight;
      window.scrollTo(scrollX, scrollY);

      root.style.scrollBehavior = previousRootScrollBehavior;
      body.style.scrollBehavior = previousBodyScrollBehavior;

      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div
      className="admin-booking-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={dialogRef}
        className="admin-booking-modal-dialog card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}

export default AdminBookingModalShell;
