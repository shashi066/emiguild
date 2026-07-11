'use client';

import { useEffect } from 'react';
import { Gamepad2 } from 'lucide-react';

export default function HeroInteractive() {
  useEffect(() => {
    const hero = document.querySelector('.hero') as HTMLElement | null;
    if (!hero) return;

    let raf: number;
    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        hero.style.setProperty('--mouse-x', `${x}px`);
        hero.style.setProperty('--mouse-y', `${y}px`);
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="hero-interactive" aria-hidden="true">
      <div className="hero-mouse-glow" />
      <Gamepad2 className="hero-giant-silhouette" strokeWidth={0.75} />
    </div>
  );
}
