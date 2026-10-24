import { HomeLoadingBoundary } from '@/components/HomeLoadingBoundary';
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <HomeLoadingBoundary>{children}</HomeLoadingBoundary>;
}
