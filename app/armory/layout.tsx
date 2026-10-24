import { ArmoryLoadingBoundary } from '@/components/ArmoryLoadingBoundary';

export default function ArmoryLayout({ children }: { children: React.ReactNode }) {
  return <ArmoryLoadingBoundary>{children}</ArmoryLoadingBoundary>;
}
