import { Crown, Heart } from 'lucide-react';
import styles from './SpinGuarantees.module.css';

type Streak = { current: number; target: number; guaranteedToday: boolean; spinsRemaining: number };
type Legendary = { enabled: boolean; current: number; target: number; spinsRemaining: number };

export function SpinGuarantees({ streak, legendary, canSpin = false }: { streak?: Streak; legendary?: Legendary; canSpin?: boolean }) {
  const hasLegendary = !!legendary?.enabled;
  if (!hasLegendary && !streak) return null;
  const target = hasLegendary ? 30 : streak!.target;
  const current = Math.min(target, Math.max(0, hasLegendary ? legendary!.current : streak!.current));
  const ready = current >= target - 1;
  const title = hasLegendary ? 'Legendary' : 'Epic';
  const purpleEnd = Math.min(100, 20 / Math.max(current, 1) * 100);
  return <section className={styles.panel} data-legendary={hasLegendary} data-gold={hasLegendary && current >= 21} aria-label="Spin guarantees">
    <div className={styles.heading}><div><span>{hasLegendary ? <Crown size={15} aria-hidden="true"/> : <Heart size={14} aria-hidden="true"/>} Streak To {title}</span><strong>Day {current}<small> / {target}</small></strong></div><span className={styles.chip}>{ready ? canSpin ? 'Ready next spin' : 'Next daily spin' : `${target-current} days left`}</span></div>
    <div className={styles.track} role="progressbar" aria-label={hasLegendary?'Legendary guarantee':'Epic streak'} aria-valuemin={0} aria-valuemax={target} aria-valuenow={current} aria-valuetext={`${current} of ${target} consecutive daily spins. ${ready?'Guaranteed on the next eligible spin.':`${target-current} remaining.`}`}><span style={{width:`${current/target*100}%`, background:hasLegendary?`linear-gradient(90deg, #a875e6 0% ${purpleEnd}%, #f4d477 ${purpleEnd}% 100%)`:undefined}}/></div>
    <div className={styles.days} aria-label={`${title} daily indicators`}>{Array.from({length:target},(_,i)=>{
      const day=i+1, heart=hasLegendary&&(day===10||day===20);
      return <span key={day} data-complete={day<=current} data-yellow={hasLegendary && day>=21} data-heart={heart} data-final={day===target} aria-label={`Day ${day}: ${day<=current?'completed':'not completed'}${heart?'. Purple heart marker; Epic readiness is tracked separately.':''}`}>{heart||(!hasLegendary&&day===target)?<Heart size={13} fill="currentColor" aria-hidden="true"/>:day===target?<Crown size={13} aria-hidden="true"/>:day}</span>;
    })}</div>
    {ready && <p className={styles.message}>Your next eligible daily spin guarantees {title}.</p>}
  </section>;
}
