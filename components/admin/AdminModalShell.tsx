'use client';

import { ReactNode, useEffect, useRef } from 'react';

export type AdminModalShellSize = 'default' | 'wide';

export type AdminModalShellProps = {
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  children: ReactNode;
  size?: AdminModalShellSize;
  lightweight?: boolean;
};

const FOCUSABLE_ELEMENT_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'details > summary:first-of-type',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENT_SELECTOR)).filter(
    (element) => {
      const style = window.getComputedStyle(element);
      return (
        element.tabIndex >= 0 &&
        element.getClientRects().length > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        !element.closest('[inert]')
      );
    },
  );
}

export function AdminModalShell({
  onClose,
  labelledBy,
  describedBy,
  children,
  size = 'default',
  lightweight = false,
}: AdminModalShellProps) {
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
        return;
      }

      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastFocusable : firstFocusable).focus();
        return;
      }

      if (event.shiftKey && (activeElement === firstFocusable || activeElement === dialog)) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);

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
      className={`admin-modal-overlay admin-booking-modal-overlay${lightweight ? ' admin-modal-overlay--lightweight' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={dialogRef}
        className={`admin-modal-dialog admin-booking-modal-dialog admin-modal-dialog--${size}${lightweight ? ' admin-modal-dialog--lightweight' : ''} card`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}

export default AdminModalShell;
