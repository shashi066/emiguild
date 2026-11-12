import { TimedIntroBoundary } from '@/components/TimedIntroBoundary';
import GamesLoader, { GAMES_LOADING_DURATION_MS } from '@/components/GamesLoader';

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return <TimedIntroBoundary durationMs={GAMES_LOADING_DURATION_MS} loader={<GamesLoader />}>{children}</TimedIntroBoundary>;
}
