'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Castle, RotateCw, Hammer, Target, Gift, Trophy } from 'lucide-react';
import styles from './side-quest-showcase.module.css';

const quests = [
  { name: 'Guild Spin', href: '/daily-spin', icon: RotateCw },
  { name: 'Tower', href: '/tower', icon: Castle },
  { name: 'Artifacts', href: '/armory', icon: Hammer },
  { name: 'Guess 36', href: '/guess-36', icon: Target },
  { name: 'Guild Drop', href: '/draws', icon: Gift },
  { name: 'Tournament', href: '/tournaments', icon: Trophy },

];
export default function SideQuestShowcase() {
  const root = useRef<HTMLElement>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    let visible = false;
    const sync = () => setRunning(visible && document.visibilityState === 'visible');
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    }) : null;
    if (observer && root.current) observer.observe(root.current);
    else { visible = true; sync(); }
    document.addEventListener('visibilitychange', sync);
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, []);


  return <section ref={root} className={`${styles.showcase} ${running ? styles.running : ''}`} aria-labelledby="side-quests-title">
    <header className={styles.heading}><span>Beyond the session</span><h2 id="side-quests-title">Choose your side quest.</h2><p>A little luck. A new challenge. Your next discovery.</p></header>
    <div className={styles.wheel}>
      <div className={styles.track} aria-hidden="true" />
      <div className={styles.hub} aria-hidden="true"><span>EMI</span><strong>GUILD</strong></div>
      <nav className={styles.orbit} aria-label="Side quests">{quests.map((quest, i) => {
        const Icon = quest.icon;
        return <Link href={quest.href} key={quest.href} className={styles.satellite} style={{ '--angle': `${i * 60 - 90}deg`, '--counter-angle': `${90 - i * 60}deg` } as React.CSSProperties}>
          <span className={styles.label}><Icon size={24} aria-hidden="true" /><span className={styles.name}>{quest.name}</span></span>
        </Link>;
      })}</nav>
    </div>
  </section>;
}
