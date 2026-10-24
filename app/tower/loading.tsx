import { TowerRouteLoader } from '@/components/TowerLoadingBoundary';

export default function TowerLoading() {
  return (
    <main style={{ minHeight: 'calc(100dvh - 124px)', display: 'grid', placeItems: 'center', padding: '24px 10px 36px', background: '#080d16' }} aria-busy="true">
      <div className="loading-state" style={{ padding: 24 }}>
        <TowerRouteLoader />
      </div>
    </main>
  );
}
