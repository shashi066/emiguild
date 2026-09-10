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
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  color: 'inherit',
  font: 'inherit',
  fontWeight: 'inherit',
  lineHeight: 1,
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
};

const imageStyle: CSSProperties = {
  width: 22,
  height: 22,
  flex: '0 0 22px',
  objectFit: 'contain',
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
        width={22}
        height={22}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="emicoin-amount-icon"
        style={imageStyle}
      />
      <span className="emicoin-value" style={visibleValueStyle} aria-hidden="true">
        {visibleValue}
      </span>
    </span>
  );
}
