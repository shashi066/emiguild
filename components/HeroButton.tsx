'use client';

import Link from 'next/link';
import { LucideIcon, ChevronRight } from 'lucide-react';
import ScrollToSection from '@/components/ScrollToSection';

type ButtonVariant =
  | 'primary'
  | 'ghost'
  | 'gold'
  | 'green'
  | 'purple'
  | 'red'
  | 'station'
  | 'pass'
  | 'games'
  | 'spin'
  | 'drop'
  | 'tournament'
  | 'dungeon';
type AnimationVariant = 'none' | 'spin' | 'lucky' | 'tournament';

interface HeroButtonProps {
  label: string;
  icon: LucideIcon;
  href?: string;
  targetId?: string;
  variant?: ButtonVariant;
  animation?: AnimationVariant;
  className?: string;
  id?: string;
  onClick?: () => void;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {},
  ghost: {},
  gold: {
    background: 'rgba(255,215,0,0.1)',
    border: '1px solid rgba(255,215,0,0.3)',
    color: '#FFD700',
  },
  green: {
    background: 'rgba(0, 230, 118, 0.1)',
    border: '1px solid rgba(0, 230, 118, 0.35)',
    color: '#e8ffed',
  },
  purple: {
    background: 'rgba(108,99,255,0.14)',
    border: '1px solid rgba(108,99,255,0.4)',
    color: '#a78bfa',
  },
  red: {
    background: 'rgba(255,107,107,0.12)',
    border: '1px solid rgba(255,107,107,0.4)',
    color: '#ff8a8a',
  },
  station: {
    background: 'rgba(0, 212, 255, 0.09)',
    border: '1px solid rgba(0, 212, 255, 0.32)',
    color: '#bff4ff',
  },
  pass: {
    background: 'rgba(255, 196, 87, 0.11)',
    border: '1px solid rgba(255, 196, 87, 0.36)',
    color: '#ffe0a3',
  },
  games: {
    background: 'rgba(0, 230, 118, 0.1)',
    border: '1px solid rgba(0, 230, 118, 0.34)',
    color: '#c9ffd8',
  },
  spin: {
    background: 'rgba(125, 92, 255, 0.13)',
    border: '1px solid rgba(125, 92, 255, 0.38)',
    color: '#d7ccff',
  },
  drop: {
    background: 'rgba(255, 84, 214, 0.12)',
    border: '1px solid rgba(255, 84, 214, 0.34)',
    color: '#ffd6f5',
  },
  tournament: {
    background: 'rgba(255, 72, 72, 0.12)',
    border: '1px solid rgba(255, 72, 72, 0.36)',
    color: '#ffd6d6',
  },
  dungeon: {
    background: '#02040a',
    border: '1px solid rgba(0, 174, 255, 0.48)',
    color: '#e8f7ff',
  },
};

const animationClasses: Record<AnimationVariant, string> = {
  none: '',
  spin: 'spin-float-btn',
  lucky: 'guild-drop-btn',
  tournament: 'tournament-btn',
};

const animationStyles: Record<AnimationVariant, React.CSSProperties> = {
  none: {},
  spin: {},
  lucky: {},
  tournament: {},
};

export default function HeroButton({
  label,
  icon: Icon,
  href,
  targetId,
  variant = 'ghost',
  animation = 'none',
  className = '',
  id,
  onClick,
}: HeroButtonProps) {
  const baseClass = variant === 'primary' ? 'btn btn-primary btn-lg' : 'btn btn-ghost btn-lg';
  const animClass = animationClasses[animation];
  const combinedClass = [baseClass, animClass, className].filter(Boolean).join(' ');
  const style = { ...variantStyles[variant], ...animationStyles[animation] };

  const button = (
    <button type="button" className={combinedClass} style={style} id={id} onClick={onClick}>
      <Icon size={18} />
      {label}
    </button>
  );

  if (targetId) {
    return (
      <ScrollToSection targetId={targetId} className={combinedClass} style={style}>
        <Icon size={18} />
        {label}
        {targetId === 'stations' && <ChevronRightIcon />}
      </ScrollToSection>
    );
  }

  if (href) {
    return (
      <Link href={href} className={combinedClass} style={style}>
        <Icon size={18} />
        {label}
      </Link>
    );
  }

  return button;
}

function ChevronRightIcon() {
  return <ChevronRight size={18} />;
}
