import { Guess36LoadingBoundary } from '@/components/Guess36LoadingBoundary';

export default function Guess36Layout({ children }: { children: React.ReactNode }) {
  return <Guess36LoadingBoundary>{children}</Guess36LoadingBoundary>;
}
