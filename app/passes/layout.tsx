import { TimedIntroBoundary } from '@/components/TimedIntroBoundary';
import PassesLoader, { PASSES_LOADING_DURATION_MS } from '@/components/PassesLoader';

export default function PassesLayout({ children }: { children: React.ReactNode }) {
  return <TimedIntroBoundary durationMs={PASSES_LOADING_DURATION_MS} loader={<PassesLoader />}>{children}</TimedIntroBoundary>;
}
