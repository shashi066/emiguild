import Link from 'next/link';
import { Gamepad2, Calendar, ChevronRight, Award, ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';

const CATEGORIES = [
  'Single-Player Adventures',
  'Multiplayer, Co-op & Competitive',
  'Racing & Simulator Experience',
];

async function getGames() {
  try {
    const games = await prisma.game.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { position: 'asc' }, { name: 'asc' }],
    });
    return games;
  } catch (error) {
    console.error('Error fetching games:', error);
    return [];
  }
}

export default async function GamesPage() {
  const games = await getGames();

  // Group games by category
  const groupedGames = games.reduce((acc, game) => {
    if (!acc[game.category]) acc[game.category] = [];
    acc[game.category].push(game);
    return acc;
  }, {} as Record<string, typeof games>);

  return (
    <main className="page-shell">
      <section className="section">
        <div className="container">
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: '1.5rem', fontSize: '0.9rem', transition: 'color 0.2s ease' }}>
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <div className="section-header">
            <div className="section-tag">Available Games</div>
            <h1 className="section-title">
              Explore Our <span className="text-gradient">PS5 Game Library</span>
            </h1>
            <p className="section-description">
              Discover the latest single-player adventures, co-op favorites, and competitive titles available for your next session.
            </p>

            <div className="games-cta-row" style={{ marginTop: 'var(--space-xl)' }}>
              <Link href="/book" className="btn btn-primary">
                <Calendar size={18} />
                Book a Slot Now
              </Link>

              <Link
                href="/passes"
                className="btn btn-ghost"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,215,0,0.1), rgba(205,127,50,0.1))',
                  border: '1px solid rgba(255,215,0,0.3)',
                  color: '#FFD700',
                }}
              >
                <Award size={18} />
                Monthly Passes
              </Link>
            </div>
          </div>

          {games.length === 0 ? (
            <div className="card" style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Gamepad2 size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
              <p>No games available at the moment. Check back soon!</p>
            </div>
          ) : (
            <div className="games-library-grid">
              {CATEGORIES.map((category) => {
                const categoryGames = groupedGames[category] || [];
                if (categoryGames.length === 0) return null;

                return (
                  <div key={category} className="card card-hover games-category-card">
                    <div className="games-category-badge">
                      <Gamepad2 size={16} />
                      {category}
                    </div>
                    <ul className="games-list">
                      {categoryGames.map((game) => (
                        <li key={game.id}>{game.name}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
