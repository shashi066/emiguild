import '../tournament.css';

export default function Loading() {
  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      {/* Title / Action Placeholder */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
        <div style={{ height: '48px', width: '200px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
      </div>

      {/* Stats Grid Placeholder */}
      <div className="tourn-stats-grid" style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="tourn-stat-card">
            <div className="tourn-stat-icon" style={{ background: 'rgba(255,255,255,0.05)' }} />
            <div className="tourn-stat-info">
              <div style={{ height: '12px', width: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', marginBottom: '8px' }} />
              <div style={{ height: '16px', width: '80px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
            </div>
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
      `}} />
    </div>
  );
}
