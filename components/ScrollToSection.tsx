'use client';

interface ScrollToSectionProps {
  targetId: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export default function ScrollToSection({ targetId, className, style, children }: ScrollToSectionProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <button onClick={handleClick} className={className} style={style}>
      {children}
    </button>
  );
}
