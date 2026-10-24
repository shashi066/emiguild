import { VaultLoadingBoundary } from '@/components/VaultLoadingBoundary';

export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return <VaultLoadingBoundary>{children}</VaultLoadingBoundary>;
}
