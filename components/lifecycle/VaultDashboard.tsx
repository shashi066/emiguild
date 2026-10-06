import Link from 'next/link';
import { TowerReviewButton } from '@/components/TowerReviewButton';
import { ArrowRight, Castle, Check, Flame, Gift, Hammer, RotateCw, Target, User, Shield, Footprints, HardHat, Hand, ChevronRight } from 'lucide-react';
import { AccountState, GameProgress, orderVaultItems, formatVaultTime } from '@/lib/lifecycle/rules';
import { selectNextUnlock, selectVaultAction } from '@/lib/lifecycle/vault-presentation';
import styles from './vault.module.css';

const icons = { guess36: Target, spin: RotateCw, artifacts: Hammer, tower: Castle, 'guild-drop': Gift };
function Action({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return <Link className={primary ? styles.primaryButton : styles.linkButton} href={href}>{children}<ArrowRight size={18} aria-hidden="true" /></Link>;
}
function VaultTime({ value }: { value: string }) {
  const label = new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
  return <time dateTime={value} title={formatVaultTime(value)}>{label}</time>;
}
function Deadline({ game }: { game: GameProgress }) {
  return game.deadline ? <p className={styles.helper}>{game.deadline.label} · <VaultTime value={game.deadline.at} /></p> : null;
}
function Badge({ game }: { game: GameProgress }) {
  const label = game.status === 'error' ? 'Unavailable' : game.status === 'disabled' ? 'Paused' : game.facts?.usedToday ? 'Used today' : game.status === 'empty' ? 'Not started' : game.status;
  return <span className={styles.badge} data-available={game.status === 'available' && !game.facts?.usedToday}>{label}{game.facts?.usedToday && game.status !== 'disabled' && <Check size={14} aria-hidden="true" />}</span>;
}
function CardHeader({ game, title }: { game: GameProgress; title?: string }) {
  const Icon = icons[game.id];
  return <div className={styles.cardHeader}><Icon className={styles.icon} size={28} aria-hidden="true" /><h3>{title ?? game.title}</h3><Badge game={game} /></div>;
}
function Details({ game }: { game: GameProgress }) {
  return <ul className={styles.details}>{game.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>;
}
function GuessPicks({ game }: { game: GameProgress }) {
  if (!game.facts?.guessPicks) return null;
  const picks = game.facts.guessPicks;
  return <dl className={styles.picks}>
    <div><dt>Your pick today</dt><dd>{picks.today ?? 'Not picked yet'}</dd></div>
    <div><dt>Your pick yesterday</dt><dd>{picks.yesterday ?? 'Did not enter'}</dd></div>
    <div><dt>Yesterday’s winning number</dt><dd>{picks.result ?? 'Result pending'}</dd></div>
  </dl>;
}
function Progress({ current, total, label }: { current: number; total: number; label: string }) {
  return <progress className={styles.progress} value={Math.min(current, total)} max={total} aria-label={label} />;
}
function DailyGameCard({ game, now }: { game: GameProgress; now: Date }) {
  const spin = game.id === 'spin';
  const available = game.facts?.dailyAvailable && game.status !== 'disabled' && (!game.deadline || Date.parse(game.deadline.at) > now.getTime());
  const slotIcons = [HardHat, Shield, Hand, Footprints];
  return <article className={styles.card}>
    <CardHeader game={game} title={spin ? 'Daily Spin' : 'Daily Forge'} />
    {game.status === 'error' ? <p>Progress temporarily unavailable. Refresh to try again.</p> : spin ? <>
      <p className={styles.strong}><Flame size={20} />Streak: {game.progress?.current ?? 0} of {game.progress?.total ?? 10} days</p>
      <div className={styles.streak} aria-label={`${game.progress?.current ?? 0} of ${game.progress?.total ?? 10} streak days`}>
        {Array.from({ length: game.progress?.total ?? 10 }, (_, i) => <span key={i} data-filled={i < (game.progress?.current ?? 0)} />)}<Gift size={24} aria-hidden="true" />
      </div>
      <p className={styles.secondary}>{game.facts?.goals?.length ? `${Math.max(0, (game.progress?.total ?? 10) - (game.progress?.current ?? 0))} more consecutive spins toward an Epic reward` : 'Build your streak with a daily spin.'}</p>
      {game.facts?.rewardName && <div className={styles.inset}><Gift size={22} /><span>Today’s reward<br /><strong>{game.facts.rewardName}</strong></span></div>}
      {!available && <p className={styles.secondary}>{game.status === 'disabled' ? 'Daily spin is paused' : game.facts?.usedToday ? 'Your next spin unlocks at the daily reset.' : game.summary}</p>}
    </> : <>
      <p>{game.facts?.ownedArtifacts ?? '—'} artifacts collected</p>
      <div className={styles.slots}>{(game.facts?.slots ?? []).map((slot, i) => { const Icon = slotIcons[i]; return <div key={slot.slot} className={styles.slot} data-owned={!!slot.name} title={slot.name ?? 'Empty slot'}><Icon size={25} aria-hidden="true" /><span>{slot.slot.toLowerCase()}</span><span className={styles.srOnly}>{slot.name ?? 'Empty'}</span></div>; })}</div>
      <p className={styles.secondary}>{game.progress?.current ?? 0} of 4 matching pieces equipped</p>
      <Progress current={game.progress?.current ?? 0} total={4} label="Matching equipped artifact set" />
      <p className={styles.secondary}>{game.facts?.canClaim ? 'Your completed set is ready to exchange.' : 'Equip four matching pieces to unlock a set reward.'}</p>
    </>}
    <Deadline game={game} />
    <Action href={game.href} primary={!!available}>{available ? spin ? 'Take your daily spin' : 'Forge today’s artifact' : spin ? 'View spin rewards' : 'Visit Armory'}</Action>
  </article>;
}
function OverviewCard({ game, now, refresh }: { game: GameProgress; now: Date; refresh?: () => void }) {
  const tower = game.id === 'tower';
  const valid = !game.deadline || Date.parse(game.deadline.at) > now.getTime();
  const tokens = (game.facts?.tokenExpiries ?? []).filter((at) => Date.parse(at) > now.getTime()).length;
  return <article className={styles.card}><CardHeader game={game} />
    <p className={styles.strong}>{tower && game.status !== 'disabled' && game.status !== 'error' && !game.progress ? tokens ? 'Ready for your next climb' : 'Earn a Tower Token to start your next climb' : game.summary}</p>
    {game.progress && <><p className={styles.secondary}>{game.progress.label} {game.progress.current} of {game.progress.total}</p><Progress {...game.progress} /></>}
    {game.id === 'guess36' && <GuessPicks game={game} />}
    <Details game={game} />
    {game.facts?.events?.map((event) => <p className={styles.helper} key={event.id}>{event.at && <>{event.title} · <VaultTime value={event.at} /></>}</p>)}
    <Deadline game={game} />
    {tower && game.status !== 'disabled' && game.status !== 'error' && game.facts?.review && <TowerReviewButton initialReview={game.facts.review} statusSource="vault" onTokenGranted={refresh} />}
    <Action href={game.href}>{tower && valid && game.status !== 'disabled' && game.status !== 'error' ? game.facts?.canClaim ? 'Claim secured reward' : game.progress ? 'Continue Tower' : tokens ? 'Start Tower' : 'Explore Tower' : game.action}</Action>
  </article>;
}
export function VaultDashboard({ state, loading, error, refresh, now }: { now: Date; state: AccountState | null; loading: boolean; error: string; refresh: () => void }) {
  const games = state?.games ?? [];
  const byId = (id: GameProgress['id']) => games.find((game) => game.id === id);
  const spin = byId('spin'), artifacts = byId('artifacts'), tower = byId('tower');
  const action = selectVaultAction(games, now), unlock = selectNextUnlock(games);
  const rewards = state ? orderVaultItems(state.items, now).filter((item) => item.kind === 'reward') : [];
  const stats = [
    { label: 'Tower Tokens', value: tower?.facts?.tokenExpiries?.filter((at) => Date.parse(at) > now.getTime()).length, Icon: Castle, failed: tower?.status === 'error' },
    { label: 'Day Streak', value: spin?.progress?.current, Icon: Flame, failed: spin?.status === 'error' },
    { label: 'Artifacts', value: artifacts?.facts?.ownedArtifacts, Icon: Hammer, failed: artifacts?.status === 'error' },
  ];
  return <div className={styles.shell}>
    <header className={styles.header}><div><h1>Your Vault</h1><p>Everything you’ve earned at EmiGuild.</p></div><Link className={styles.profile} href="/profile" aria-label="Your profile"><User size={22} /></Link></header>
    <div className={styles.refresh}><button onClick={refresh} disabled={loading} aria-label="Refresh Vault"><RotateCw size={15} />{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {error && <div className={styles.card} role="alert"><p>{error}</p><button className="btn btn-secondary" onClick={refresh}>Try again</button></div>}
    {loading && !state && <div role="status" aria-label="Loading Vault" className={styles.skeleton}><div /><div /><div /></div>}
    {state && <>
      <section className={styles.stats} aria-label="Your account totals">{stats.map(({ label, value, Icon, failed }) => <div key={label}><Icon aria-hidden="true" /><strong>{failed ? '—' : value ?? 0}</strong><span>{label}{failed && <small>Unavailable</small>}</span></div>)}</section>
      {state.rewardsUnavailable && <p role="alert" className={styles.secondary}>Rewards are temporarily unavailable. Refresh to try again.</p>}
      {rewards.length > 0 && <section className={styles.rewardGrid} aria-label="Available rewards">{rewards.map((reward) => <article className={styles.reward} key={reward.id}><Gift size={30} /><div><p className={styles.eyebrow}>Reward unlocked</p><h2>{reward.description}</h2><p>{reward.title}</p><p className={styles.helper}>Available until <VaultTime value={reward.validUntil} /></p><Action href={reward.href} primary>{reward.action}</Action></div></article>)}</section>}
      {unlock && <Link href={unlock.game.href} className={styles.unlock}><Gift size={40} aria-hidden="true" /><div><p className={styles.eyebrow}>Next unlock</p><h2>{unlock.game.id === 'artifacts' ? unlock.needsEquipment ? `Equip your four ${unlock.title} pieces` : `You’re ${unlock.missingOwned} artifact${unlock.missingOwned === 1 ? '' : 's'} away from ${unlock.title}` : `${unlock.total - unlock.current} more consecutive spins to your milestone`}</h2><p>Reward: {unlock.reward}</p></div><ChevronRight aria-hidden="true" /></Link>}
      {action && <section><h2 className={styles.sectionTitle}>Today’s action</h2><article className={styles.hero}><CardHeader game={action.game} /><p>{action.game.summary}</p>{action.game.id === 'guess36' && <><GuessPicks game={action.game} /><Details game={action.game} /></>}<Deadline game={action.game} /><Action href={action.game.href} primary>{action.label}</Action></article></section>}
      <section><h2 className={styles.sectionTitle}>Today</h2><div className={styles.grid}>{spin && <DailyGameCard game={spin} now={now} />}{artifacts && <DailyGameCard game={artifacts} now={now} />}{byId('guess36') && action?.game.id !== 'guess36' && <OverviewCard game={byId('guess36')!} now={now} />}</div></section>
      <section><h2 className={styles.sectionTitle}>Your progress</h2>{tower && <OverviewCard game={tower} now={now} refresh={refresh} />}</section>
      <section aria-label="Guild Drop" className={styles.dropSection}>{byId('guild-drop') && <OverviewCard game={byId('guild-drop')!} now={now} />}</section>
    </>}
  </div>;
}
