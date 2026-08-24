export default function TowerLoading() {
  return (
    <main style={{ minHeight: 'calc(100dvh - 124px)', display: 'grid', placeItems: 'center', padding: '24px 10px 36px', background: '#080d16' }} aria-busy="true">
      <div className="loading-state" role="status" aria-live="polite" style={{ padding: 24 }}>
        <span className="spinner" aria-hidden="true" />
        <span>Loading Tower...</span>
      </div>
    </main>
  );
}
