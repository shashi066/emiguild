'use client';

import Link from 'next/link';
import { LucideIcon, ChevronRight } from 'lucide-react';
import ScrollToSection from '@/components/ScrollToSection';

type ButtonVariant = 'primary-blue' | 'primary-red' | 'secondary-gold' | 'secondary-gray' | 'secondary-green' | 'secondary-orange' | 'secondary-purple' | 'ghost';

interface HeroButtonProps {
  label: string;
  icon: LucideIcon;
  href?: string;
  targetId?: string;
  variant?: ButtonVariant;
  className?: string;
  id?: string;
  badge?: string;
}

export default function HeroButton({
  label,
  icon: Icon,
  href,
  targetId,
  variant = 'ghost',
  className = '',
  id,
  badge,
}: HeroButtonProps) {

  let variantClass = 'btn-v2-ghost';
  if (variant.startsWith('primary')) {
    variantClass = `btn-v2-primary-${variant.split('-')[1]}`;
  } else if (variant.startsWith('secondary')) {
    variantClass = `btn-v2-secondary btn-v2-secondary-${variant.split('-')[1]}`;
  }

  const combinedClass = ['btn-v2', variantClass, className].filter(Boolean).join(' ');

  const iconElement = <Icon size={22} className="btn-v2-icon" />;
  const buttonContent = (
    <>
      <span className="btn-v2-glass"></span>
      {iconElement}
      <span className="btn-v2-label">{label}</span>
      {badge && <span className="btn-v2-badge">{badge}</span>}
      {targetId === 'stations' && <ChevronRight size={22} className="btn-v2-icon" />}
    </>
  );

  if (targetId) {
    return (
      <ScrollToSection targetId={targetId} className={combinedClass}>
        {buttonContent}
      </ScrollToSection>
    );
  }

  if (href) {
    return (
      <Link href={href} className={combinedClass} id={id}>
        {buttonContent}
      </Link>
    );
  }

  return (
    <button className={combinedClass} id={id}>
      {buttonContent}
    </button>
  );
}