'use client';
import { useId } from 'react';
import { Gamepad2, Ticket } from 'lucide-react';
import styles from './HappyTicketArtwork.module.css';

export const HAPPY_TICKET_TEXTURE = '/images/happy-tickets/neon-v1.webp';
export const HAPPY_TICKET_LAST_TEXTURE = '/images/happy-tickets/last-ticket-v1.webp';
const SHAPE = 'M48 3H888A28 28 0 0 0 944 3H1152Q1197 3 1197 48V492Q1197 537 1152 537H944A28 28 0 0 0 888 537H48Q3 537 3 492V48Q3 3 48 3Z';
const LAST_SHAPE = 'M44 3H902Q906 3 908 13Q916 33 924 13Q926 3 930 3H1156L1197 44V219A51 51 0 0 0 1197 321V496L1156 537H930Q926 537 924 527Q916 507 908 527Q906 537 902 537H44L3 496V321A51 51 0 0 0 3 219V44Z';

// Red artwork is retained as an explicit future opt-in, never selected by stock.
export function HappyTicketArtwork({ available = 5, appearance = 'neon' }: { available?: number; appearance?: 'neon' | 'last' }) {
  const last = appearance === 'last';
  const shape = last ? LAST_SHAPE : SHAPE;
  const uid = useId().replace(/:/g, '');
  const clip = uid + '-clip', rim = uid + '-rim', surface = uid + '-surface', shade = uid + '-shade';
  return <div className={styles.reference} data-ticket-shape={last ? 'last' : 'neon'} data-empty={available === 0}>
    <svg className={styles.surface} viewBox="0 0 1200 540" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}><path d={shape} /></clipPath>
        <linearGradient id={rim} x1="0" y1="0" x2="1200" y2="180" gradientUnits="userSpaceOnUse">
          <stop stopColor={last ? '#ffb0a6' : '#b686ff'}/><stop offset=".35" stopColor={last ? '#ff4545' : '#5e8dea'}/><stop offset=".65" stopColor={last ? '#f83f3f' : '#64adf4'}/><stop offset="1" stopColor={last ? '#ff9c94' : '#64eff6'}/>
        </linearGradient>
        <linearGradient id={surface} x1="0" y1="0" x2="1" y2="1"><stop stopColor={last ? '#2c0a10' : '#111b34'}/><stop offset="1" stopColor={last ? '#13080c' : '#081323'}/></linearGradient>
        <linearGradient id={shade}><stop stopColor="#050c1a" stopOpacity=".25"/><stop offset=".4" stopColor="#050c1a" stopOpacity=".2"/><stop offset=".6" stopColor="#050c1a" stopOpacity="0"/></linearGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <path d={shape} fill={`url(#${surface})`}/>
        <image href={last ? HAPPY_TICKET_LAST_TEXTURE : HAPPY_TICKET_TEXTURE} x="0" y="0" width="1200" height="540" preserveAspectRatio="xMidYMid slice"/>
        <path d={shape} fill={`url(#${shade})`}/>
        <path d="M916 40V500" stroke={last ? '#ffd1cb' : '#a7c5ea'} strokeWidth="2" strokeDasharray={last ? '24 16' : '10 10'} opacity=".8"/>
      </g>
      <path data-ticket-outline="" d={shape} fill="none" stroke={`url(#${rim})`} strokeWidth={last ? 4 : 2.5}/>
    </svg>
    <div className={styles.referenceFace}>
      <span className={styles.referenceBrand}><Ticket aria-hidden="true"/> HAPPY TICKET</span>
      <strong className={styles.referenceValue}><span>1</span> HOUR</strong>
      <span className={styles.referenceCaption}>PS5 SESSION</span>
    </div>
    <div className={styles.referenceStub}>
      <Gamepad2 className={styles.referenceGamepad} strokeWidth={1.35} aria-hidden="true"/>
      <span className={styles.referenceGuild}>EMI GUILD</span>
      <div className={styles.barcode} aria-hidden="true"/>
    </div>
  </div>;
}
