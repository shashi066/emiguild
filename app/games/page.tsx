import Link from 'next/link';
import { Gamepad2, Calendar, ChevronRight, Award } from 'lucide-react';

const AVAILABLE_GAMES = [
  {
    category: 'Single-Player Adventures',
    games: [
      'Black Myth: Wukong',
      'God of War Ragnarök',
      'Ghost of Tsushima Director\'s Cut',
      'Marvel\'s Spider-Man: Miles Morales',
      'Horizon Forbidden West',
      'Red Dead Redemption 2',
      'The Witcher 3: Wild Hunt',
      'Hogwarts Legacy',
      'Final Fantasy XVI',
      'Final Fantasy VII Rebirth',
      'Death Stranding Director\'s Cut',
      'Ratchet & Clank: Rift Apart',
      'Assassin\'s Creed Valhalla',
      'Assassin\'s Creed Mirage',
      'Uncharted: Legacy of Thieves Collection',
      'Mafia Trilogy',
      'Resident Evil 4 Remake',
      'Resident Evil Village',
      'Days Gone',
      'Alan Wake 2',
      'Dead Space Remake',
      'The Callisto Protocol',
    ],
  },
  {
    category: 'Multiplayer, Co-op & Competitive',
    games: [
      'EA Sports FC 26',
      'Cricket 24',
      'WWE 2K26',
      'NBA 2K26',
      'GTA V Online',
      'Call of Duty: Black Ops III',
      'Call of Duty: Black Ops 6',
      'Tekken 8',
      'Mortal Kombat 1',
      'Mortal Kombat 11',
      'Injustice 2',
      'Street Fighter 6',
      'Rainbow Six Siege',
      'Helldivers 2',
      'Destiny 2',
      'Overwatch 2',
      'Evil Dead: The Game',
      'It Takes Two',
      'A Way Out',
      'Overcooked! All You Can Eat',
      'Sackboy: A Big Adventure',
    ],
  },
  {
    category: 'Racing & Simulator Experience',
    games: ['F1 25', 'Gran Turismo 7', 'Forza Horizon 5', 'The Crew Motorfest', 'Need for Speed Unbound'],
  },
];

export default function GamesPage() {
  return (
    <main className="page-shell">
      <section className="section">
        <div className="container">
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
              <Link href="/" className="btn btn-ghost">
                Back Home
                <ChevronRight size={18} />
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

          <div className="games-library-grid">
            {AVAILABLE_GAMES.map((group) => (
              <div key={group.category} className="card card-hover games-category-card">
                <div className="games-category-badge">
                  <Gamepad2 size={16} />
                  {group.category}
                </div>
                <ul className="games-list">
                  {group.games.map((game) => (
                    <li key={game}>{game}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
