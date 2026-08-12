'use client';

import type { CSSProperties } from 'react';
import Image from 'next/image';

export const EMIC_FULL_NAME = 'EMIC';
export const EMIC_CODE = 'EMIC';
export const EMIC_IMAGE_SRC = '/images/emicoin.png';

type EmicoinAmountProps = {
  value: number | null | undefined;
  className?: string;
};

const amountStyle: CSSProperties = {
  height: 36,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  padding: '3px 10px 3px 3px',
  border: '1px solid transparent',
  borderRadius: 999,
  background: [
    'linear-gradient(105deg, rgba(34, 211, 238, 0.1), #071426 42%, rgba(124, 58, 237, 0.14)) padding-box',
    'linear-gradient(135deg, rgba(34, 211, 238, 0.82), rgba(124, 58, 237, 0.82)) border-box',
  ].join(', '),
  boxShadow: [
    'inset 0 0 0 1px rgba(157, 231, 255, 0.06)',
    'inset 0 0 12px rgba(34, 211, 238, 0.08)',
    '0 0 9px rgba(74, 118, 255, 0.2)',
  ].join(', '),
  color: 'inherit',
  font: 'inherit',
  fontWeight: 'inherit',
  lineHeight: 1,
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
};

const imageStyle: CSSProperties = {
  width: 28,
  height: 28,
  flex: '0 0 28px',
  objectFit: 'contain',
  filter: 'drop-shadow(0 0 3px rgba(108, 99, 255, 0.45))',
};

const visibleValueStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
};

const visuallyHiddenStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

const emicFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 1,
});

function formatEmicValue(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? null
    : emicFormatter.format(value);
}

export function EmicoinAmount({ value, className = '' }: EmicoinAmountProps) {
  const formattedValue = formatEmicValue(value);
  const visibleValue = formattedValue ?? '--';
  const accessibleValue = formattedValue == null
    ? 'EMIC amount unavailable'
    : `${formattedValue} ${EMIC_CODE}`;

  return (
    <span className={`emicoin-amount ${className}`.trim()} style={amountStyle}>
      <span className="emicoin-sr" style={visuallyHiddenStyle}>{accessibleValue}</span>
      <Image
        src={EMIC_IMAGE_SRC}
        width={28}
        height={28}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="emicoin-amount-icon"
        style={imageStyle}
      />
      <span className="emicoin-value" style={visibleValueStyle} aria-hidden="true">
        {visibleValue} {EMIC_CODE}
      </span>
    </span>
  );
}
