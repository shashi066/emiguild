'use client';

import Link from 'next/link';
import { LucideIcon, ChevronRight } from 'lucide-react';
import ScrollToSection from '@/components/ScrollToSection';

type ButtonVariant = 'primary' | 'ghost' | 'gold' | 'green' | 'purple' | 'red';
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
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {},
  ghost: {},
  gold: {
    background: 'linear-gradient(135deg, rgba(255,215,0,0.1), rgba(205,127,50,0.1))',
    border: '1px solid rgba(255,215,0,0.3)',
    color: '#FFD700',
  },
  green: {
    background: 'linear-gradient(135deg, rgba(0, 230, 118, 0.12), rgba(0, 150, 80, 0.08))',
    border: '1px solid rgba(0, 230, 118, 0.35)',
    color: '#e8ffed',
  },
  purple: {
    background: 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(168,85,247,0.1))',
    border: '1px solid rgba(108,99,255,0.4)',
    color: '#a78bfa',
  },
  red: {
    background: 'linear-gradient(135deg, rgba(255,107,107,0.15), rgba(255,165,0,0.1))',
    border: '1px solid rgba(255,107,107,0.4)',
    color: '#ff8a8a',
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
  spin: { animation: 'spin-pulse 2s ease-in-out infinite' },
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
}: HeroButtonProps) {
  const baseClass = variant === 'primary' ? 'btn btn-primary btn-lg' : 'btn btn-ghost btn-lg';
  const animClass = animationClasses[animation];
  const combinedClass = [baseClass, animClass, className].filter(Boolean).join(' ');
  const style = { ...variantStyles[variant], ...animationStyles[animation] };

  const button = (
    <button className={combinedClass} style={style} id={id}>
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