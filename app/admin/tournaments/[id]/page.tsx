'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Settings, Users, GitMerge } from 'lucide-react';
import '@/app/tournaments/tournament.css';
import { decryptPhone } from '@/lib/crypto';

import OverviewTab from './OverviewTab';
import PlayersTab from './PlayersTab';
import MatchesTab from './MatchesTab';

export default function AdminTournamentDashboard() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  
  const [tournament, setTournament] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'players' | 'matches'>('overview');

  const fetchTournament = async () => {
    const res = await fetch(`/api/tournaments/${id}`);
    if (!res.ok) return router.push('/admin/tournaments');
    const data = await res.json();
    setTournament(data.tournament);
  };

  const fetchPlayers = async () => {
    const res = await fetch(`/api/tournaments/${id}/players`);
    const data = await res.json();
    setPlayers((data.players || []).map((p: any) => ({ ...p, phone: decryptPhone(p.phone) })));
  };

  const fetchMatches = async () => {
    const res = await fetch(`/api/tournaments/${id}/matches`);
    const data = await res.json();
    setMatches(data.matches || []);
  };

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchTournament(), fetchPlayers(), fetchMatches()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [id]);

  if (loading || !tournament) {
    return <div style={{ textAlign: 'center', padding: '4rem' }}><div className="tourn-spinner" /></div>;
  }

  return (
    <div className="page-shell">
      <section className="section">
        <div className="container">
          
          <Link href="/admin/tournaments" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            <ArrowLeft size={16} /> Back to Tournaments
          </Link>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-accent-primary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                {tournament.game} • {tournament.status}
              </div>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                {tournament.name}
              </h1>
            </div>
            <Link href={`/tournaments/${tournament.id}`} target="_blank" className="btn btn-ghost" style={{ border: '1px solid var(--color-border)' }}>
              View Public Page
            </Link>
          </div>

          <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', marginBottom: '2rem' }}>
            <button
              onClick={() => setActiveTab('overview')}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer',
                padding: '0.5rem 1rem', fontSize: '1rem', fontWeight: 600,
                color: activeTab === 'overview' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                borderBottom: activeTab === 'overview' ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
              }}
            >
              <Settings size={18} /> Overview
            </button>
            <button
              onClick={() => setActiveTab('players')}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer',
                padding: '0.5rem 1rem', fontSize: '1rem', fontWeight: 600,
                color: activeTab === 'players' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                borderBottom: activeTab === 'players' ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
              }}
            >
              <Users size={18} /> Players ({players.length})
            </button>
            <button
              onClick={() => setActiveTab('matches')}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer',
                padding: '0.5rem 1rem', fontSize: '1rem', fontWeight: 600,
                color: activeTab === 'matches' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                borderBottom: activeTab === 'matches' ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
              }}
            >
              <GitMerge size={18} /> Matches
            </button>
          </div>

          <div>
            {activeTab === 'overview' && <OverviewTab tournament={tournament} onRefresh={fetchAll} />}
            {activeTab === 'players' && <PlayersTab tournament={tournament} players={players} fetchPlayers={() => { fetchPlayers(); fetchTournament(); }} />}
            {activeTab === 'matches' && <MatchesTab tournament={tournament} matches={matches} fetchMatches={() => { fetchMatches(); fetchTournament(); }} />}
          </div>

        </div>
      </section>
    </div>
  );
}
