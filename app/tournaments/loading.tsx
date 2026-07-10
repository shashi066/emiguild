import './tournament.css';
import { Search } from 'lucide-react';

export default function Loading() {
  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '2rem', margin: 0 }}>Tournaments</h1>
        
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="search-box">
            <Search className="search-icon" size={18} />
            <input type="text" className="search-input" placeholder="Search..." disabled />
          </div>
          <select className="filter-select" disabled>
            <option>All Status</option>
          </select>
        </div>
      </div>

      <div className="tourn-grid">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="tourn-card" style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
            <div className="tourn-card-header">
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: '18px', width: '60%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', marginBottom: '8px' }} />
                <div style={{ height: '14px', width: '30%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
              </div>
            </div>
            
            <div className="tourn-card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ height: '14px', width: '40%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
                <div style={{ height: '14px', width: '20%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ height: '14px', width: '30%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
                <div style={{ height: '14px', width: '30%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
              </div>
            </div>

            <div className="tourn-card-footer">
              <div style={{ height: '24px', width: '80px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }} />
              <div style={{ height: '14px', width: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
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
