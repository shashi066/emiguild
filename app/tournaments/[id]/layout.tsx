'use client';

import '../tournament.css';
import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Trophy, LayoutGrid, Users, GitBranch, Swords } from 'lucide-react';

interface Tournament {
  id: string;
  name: string;
  game: string;
  status: string;
  bracketGenerated: boolean;
}

const NAV_TABS = [
  { key: 'overview',  label: 'Overview',  icon: LayoutGrid, path: '' },
  { key: 'players',   label: 'Players',   icon: Users,       path: '/players' },
  { key: 'bracket',   label: 'Knockout',  icon: GitBranch,   path: '/bracket' },
];

const STATUS_COLOR: Record<string, string> = {
  REGISTRATION_OPEN:   '#00e676',
  REGISTRATION_CLOSED: '#ffaa00',
  ONGOING:             '#00d4ff',
  FINISHED:            '#FFD700',
};

export default function TournamentLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const [tournament, setTournament] = useState<Tournament | null>(null);

  useEffect(() => {
    fetch(`/api/tournaments/${id}`)
      .then((r) => r.json())
      .then((d) => setTournament(d.tournament));
  }, [id]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  const activeTab = NAV_TABS.find((t) => {
    const fullPath = `/tournaments/${id}${t.path}`;
    return t.path === '' ? pathname === fullPath : pathname.startsWith(fullPath);
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-base)' }}>
      {/* Tournament Header */}
      <div className="tourn-layout-header">
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '1.5rem', paddingBottom: '0.5rem' }}>
            <Link href="/tournaments" style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ← Tournaments
            </Link>
          </div>

          {tournament && (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', paddingBottom: '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '12px',
                  background: 'linear-gradient(135deg, rgba(108,99,255,0.3), rgba(0,212,255,0.15))',
                  border: '1px solid rgba(108,99,255,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Trophy size={22} color="#6c63ff" />
                </div>
                <div>
                  <h1 className="tourn-layout-title" style={{ fontSize: 'clamp(1.1rem, 3vw, 1.6rem)', fontWeight: 800, fontFamily: 'Orbitron, sans-serif', lineHeight: 1.2 }}>
                    {tournament.name}
                  </h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', padding: '2px 10px', borderRadius: '9999px', background: 'rgba(108,99,255,0.15)', color: '#a78bfa', border: '1px solid rgba(108,99,255,0.2)', fontFamily: 'Orbitron, sans-serif' }}>
                      {tournament.game}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: STATUS_COLOR[tournament.status] || '#8b9cb8' }}>
                      ● {tournament.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="tourn-tabs">
            {NAV_TABS.map((tab) => {
              const href = `/tournaments/${id}${tab.path}`;
              const isActive = activeTab?.key === tab.key;
              return (
                <Link key={tab.key} href={href} className={`tourn-tab${isActive ? ' active' : ''}`}>
                  <tab.icon size={15} />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Page Content */}
      <div style={{ paddingBottom: '4rem' }}>
        {children}
      </div>
    </div>
  );
}
